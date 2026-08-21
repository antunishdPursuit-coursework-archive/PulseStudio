/* Product D — the CSV door. Rensley's lane.
 *
 * Turns a studio's own attendance export into the contract shape so the
 * engine can run on REAL records. Everything here is pure and everything
 * runs in the browser: the file never leaves the staff member's machine —
 * no upload, no server, no third party. That is a promise the UI states,
 * so this module must never gain a network call.
 *
 * Accepted shape (headers are case-insensitive, order-free):
 *   required: a member column (member/name/member name/customer/client)
 *             a date column   (date/class date/visit date/day)
 *   optional: status     (attended/no-show — absent means attended, because
 *                         a sign-in sheet only records presence; anything
 *                         unrecognized maps to unknown, never to attended)
 *             class      (class/class type/service/type)
 *             instructor (instructor/staff/teacher/coach)
 *
 * Honesty rules this module lives by:
 *   - A guessed value is worse than a skipped row: unreadable and
 *     impossible dates become stated skips naming the PHYSICAL file line.
 *   - Identity is the name as written (case-insensitive), never a lossy
 *     slug — 王伟 and 佐藤花子 are different people even though neither
 *     survives ASCII slugging.
 *   - A bare attendance export says nothing about memberships, so every
 *     person in the file is treated as an active member; the UI states it.
 */

import type { Attendance, ClassSession, FixtureSet, Member } from "./deps.js";

export interface CsvImport {
  records: FixtureSet;
  rowCount: number;
  memberCount: number;
  /** Rows we could not use, each naming its physical file line and the
   *  reason — never silent. */
  skipped: string[];
  /** Which column identity was matched on, so the page can say so. Name
   *  matching is a real limitation, not a detail to hide. */
  identityMethod: string;
  /** True when identity fell back to the member's name. */
  identityIsName: boolean;
  /** Rows that landed on a member+session already recorded. With a class
   *  column these are duplicate entries. WITHOUT one — a sign-in sheet is a
   *  name and a date — a second class the same day looks exactly the same,
   *  and the evidence counts it once either way. Stated when it happens,
   *  because it changes the number staff read. */
  sameDayRepeats: number;
  /** True when the file carried no class column, which is what makes the
   *  count above ambiguous rather than merely a duplicate. */
  classColumnMissing: boolean;
  /** How many DISTINCT names had characters removed that cannot be part of
   *  a name — zero-width spaces, bidi overrides, control characters.
   *  Counted because silently editing somebody's name would be exactly the
   *  quiet correction this product refuses everywhere else, and counted per
   *  NAME rather than per row because one member with twenty visits is one
   *  name, not twenty. */
  namesCleaned: number;
  /** True when the identity column is distinct on every row while names
   *  repeat — indistinguishable from a per-visit row number. Stated, never
   *  acted on: guessing either way splits or merges real people. */
  identityMayCountRows: boolean;
  /** How a slash date was read, and whether the file settled it. */
  dateOrder: SlashDateOrder;
  /** Names that were read as MORE THAN ONE person, each naming the name and
   *  how many people it became. A split member's visits are divided between
   *  two records, so either half can look quiet when the whole person is
   *  not — a false flag built from a spreadsheet gap, which is exactly the
   *  kind of quiet miscount this product exists to prevent. Stated, never
   *  merged: merging on a shared name would be inventing identity. */
  splitIdentities: string[];
}

/* ------------------------------------------------------------------ */
/* Parsing — small, correct, quote-aware, line-tracking                */
/* ------------------------------------------------------------------ */

export interface CsvRow {
  cells: string[];
  /** 1-based physical line in the file where this row starts — the number
   *  a staff member sees in their spreadsheet, blank lines included. */
  line: number;
}

/** Parse CSV text into rows of fields with their physical line numbers.
 *  Handles quoted fields, embedded commas, doubled quotes, and embedded
 *  newlines inside quotes. All-blank rows are dropped from the result but
 *  still advance the line count, so stated line numbers stay true. */
export interface CsvParse {
  rows: CsvRow[];
  /* THE FILE LINE WHERE A QUOTE OPENED AND NEVER CLOSED, or null.
   *
   * An odd number of quote characters is one of the commonest defects in a
   * real export, and it is silent: once the parser is inside a quote,
   * every remaining comma and newline is ordinary text, so the whole rest
   * of the file collapses into a single field of a single row. Before this
   * was tracked, a staff member could import five hundred rows, have three
   * hundred of them disappear into one cell, and read "0 rows skipped" —
   * a clean answer built on evidence the tool never saw. Nothing about the
   * salvaged rows is trustworthy after that point, so the line is reported
   * and the page states it. */
  unterminatedQuoteAtLine: number | null;
}

export function parseCsvRowsDetailed(text: string): CsvParse {
  const rows: CsvRow[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let quoteOpenedAtLine = 0;
  const endRow = (): void => {
    row.push(field);
    field = "";
    if (row.some((f) => f.trim() !== "")) rows.push({ cells: row, line: rowLine });
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        line += 1;
        field += "\n";
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
      quoteOpenedAtLine = line;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      field += ch;
    }
  }
  endRow();
  return { rows, unterminatedQuoteAtLine: inQuotes ? quoteOpenedAtLine : null };
}

/** Rows only, for callers that do not need line numbers. */
/** Rows only, for callers that have already handled the structural report
 *  or are parsing text they produced themselves. */
export function parseCsvRows(text: string): CsvRow[] {
  return parseCsvRowsDetailed(text).rows;
}

export function parseCsv(text: string): string[][] {
  return parseCsvRows(text).map((r) => r.cells);
}

/* ------------------------------------------------------------------ */
/* Header + value mapping                                              */
/* ------------------------------------------------------------------ */

const HEADER_NAMES = {
  // A stable identifier, when the studio's export has one. Priority order:
  // an explicit id beats an email, and either beats a name. Names are NOT
  // reliable identity — two members can share one, and one member can be
  // spelled two ways — but a name-only export is still worth reading, so
  // the name is the documented fallback and the page states which was used.
  identity: ["member id", "customer id", "client id", "member_id", "id", "email", "email address"],
  member: ["member", "name", "member name", "customer", "client"],
  date: ["date", "class date", "visit date", "day"],
  status: ["status", "attendance", "attended", "showed"],
  classType: ["class", "class type", "service", "type"],
  instructor: ["instructor", "staff", "teacher", "coach"],
} as const;

/* What a class is called when the export never said. A sign-in sheet is a
 * name and a date; it does not know what the person came to. The value has
 * to be SOMETHING because the contract's class_type is a string, so it is
 * this, and the draft voice maps it back to "unknown" rather than putting
 * it in a sentence. */
export const GENERIC_CLASS_TYPE = "class";

/** Find a column by synonym PRIORITY, not header position: a file with
 *  both a "Day" column (weekday names) and a "Date" column must read the
 *  real dates, so earlier synonyms in the list win over later ones. */
function findColumn(headers: string[], names: readonly string[]): number {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const i = lowered.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

/* WHICH NUMBER IS THE MONTH? A slash date is not self-describing, and
 * guessing wrong is the worst kind of wrong here because it is quiet. Read
 * as month-first, a European export dated 05/03/2026 (the 5th of March)
 * becomes the 3rd of May — a visit moved two months, silently — while
 * 25/03/2026 has "month 25" and is skipped. Half the file misdated, half
 * discarded, and a member's last visit landing wherever the arithmetic
 * dropped it.
 *
 * The file itself usually answers the question. A first component above 12
 * cannot be a month, so one such row proves the whole file is day-first;
 * a second component above 12 proves month-first the same way. Only a file
 * where NEITHER position ever exceeds 12 is genuinely ambiguous, and then
 * the page says which reading it used rather than pretending it knew. */
export type SlashDateOrder = "month-first" | "day-first" | "ambiguous" | "contradictory";

export function detectSlashDateOrder(values: readonly string[]): SlashDateOrder {
  /* ONLY A DATE THAT IS VALID UNDER EXACTLY ONE READING IS EVIDENCE.
   * Counting "some number above 12" is close but not right: 2/30/2026 has a
   * 30 in the second position, yet it is not a real date either way — the
   * 30th month does not exist any more than the 30th of February does. A
   * row that is impossible in both readings votes for neither; it is simply
   * a bad row, and it gets skipped by name further down. */
  let onlyDayFirst = false;
  let onlyMonthFirst = false;
  for (const value of values) {
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m === null) continue;
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const monthFirstWorks = isRealYmd(y, a, b);
    const dayFirstWorks = isRealYmd(y, b, a);
    if (dayFirstWorks && !monthFirstWorks) onlyDayFirst = true;
    if (monthFirstWorks && !dayFirstWorks) onlyMonthFirst = true;
  }
  if (onlyDayFirst && onlyMonthFirst) return "contradictory";
  if (onlyDayFirst) return "day-first";
  if (onlyMonthFirst) return "month-first";
  return "ambiguous";
}

/** A real calendar date, checked by round-trip — Date.UTC rolls over. */
function isRealYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const round = new Date(Date.UTC(y, m - 1, d));
  return (
    round.getUTCFullYear() === y && round.getUTCMonth() === m - 1 && round.getUTCDate() === d
  );
}

/** Normalize a date cell to YYYY-MM-DD. Accepts ISO (padded or not) and the
 *  slash shape, read in the order the file proved (see above; an ambiguous
 *  file is read month-first and the page says so) — then round-trips the
 *  value through the real calendar, so an impossible date (month 13, Feb
 *  30) returns null and becomes a stated skip instead of a guessed visit. */
export function normalizeDate(value: string, order: SlashDateOrder = "month-first"): string | null {
  const v = value.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (us) {
    y = Number(us[3]);
    const dayFirst = order === "day-first";
    m = Number(dayFirst ? us[2] : us[1]);
    d = Number(dayFirst ? us[1] : us[2]);
  } else {
    return null;
  }
  const roundTrip = new Date(Date.UTC(y, m - 1, d));
  if (
    roundTrip.getUTCFullYear() !== y ||
    roundTrip.getUTCMonth() !== m - 1 ||
    roundTrip.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Map a status cell to the contract's attendance values. An absent or
 *  empty status means attended — a sign-in sheet records presence.
 *  Anything unrecognized maps to unknown, never to attended. */
export function normalizeStatus(value: string): Attendance["attendance_status"] {
  const v = value.trim().toLowerCase();
  if (v === "" || ["attended", "present", "checked in", "checked-in", "yes", "showed", "show"].includes(v)) {
    return "attended";
  }
  if (["no-show", "no show", "noshow", "missed", "absent", "no"].includes(v)) {
    return "no_show";
  }
  return "unknown";
}

/* CHARACTERS THAT CANNOT BE PART OF A NAME, and why this is not tidiness.
 *
 * A zero-width space makes "Bob" and "Bo<ZWSP>b" two different members that
 * render identically. That is the same history-splitting failure as a
 * half-filled identifier column — one person read as two, each half looking
 * quieter than the whole — except invisible, so nobody could ever diagnose
 * it from the screen. A right-to-left override reverses how the rest of a
 * name displays, which is the old filename-spoofing trick and lands here in
 * a note a staff member is about to send to that member. Control characters
 * break downstream tools for no benefit at all.
 *
 * Stripped, therefore, and COUNTED, because silently editing somebody's
 * name is the kind of quiet correction this product refuses everywhere
 * else. Deliberately NOT stripped: U+200C and U+200D, the zero-width
 * non-joiner and joiner, which are ordinary letters-in-context in Persian,
 * Hindi and other scripts, and every combining mark. This removes what
 * cannot be a name, not what is unfamiliar. */
const NOT_IN_A_NAME =
  // C0 controls (tab, newline and carriage return are handled by the parser),
  // DEL, bidi embeddings and overrides, isolates, zero-width space, the
  // directional marks, and a byte-order mark that wandered into the text.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

export function cleanName(value: string): string {
  return value.replace(NOT_IN_A_NAME, "").trim();
}

/** Readable id fragment only — NEVER identity. Identity is keyed on the
 *  name as written; this just makes ids nicer to read when it can. */
function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/* ------------------------------------------------------------------ */
/* The adapter                                                         */
/* ------------------------------------------------------------------ */

/** Build a contract-shaped record set from attendance CSV text. Throws a
 *  loud, named error when the required columns are missing; collects
 *  per-row skips (bad dates, empty names) with stated file lines. */
export function adaptAttendanceCsv(text: string, timeZone: string): CsvImport {
  const { rows, unterminatedQuoteAtLine } = parseCsvRowsDetailed(text);
  const headerRow = rows[0];
  if (!headerRow) throw new Error("The file is empty — no header row found.");
  const headers = headerRow.cells.map((h) => h.trim());

  const memberCol = findColumn(headers, HEADER_NAMES.member);
  const dateCol = findColumn(headers, HEADER_NAMES.date);
  if (memberCol === -1 || dateCol === -1) {
    const missing = [
      memberCol === -1 ? `a member column (one of: ${HEADER_NAMES.member.join(", ")})` : null,
      dateCol === -1 ? `a date column (one of: ${HEADER_NAMES.date.join(", ")})` : null,
    ].filter((m): m is string => m !== null);
    throw new Error(`The file is missing ${missing.join(" and ")}. Found headers: ${headers.join(", ")}`);
  }
  const identityCol = findColumn(headers, HEADER_NAMES.identity);
  const statusCol = findColumn(headers, HEADER_NAMES.status);
  const classCol = findColumn(headers, HEADER_NAMES.classType);
  const instructorCol = findColumn(headers, HEADER_NAMES.instructor);

  const members: Member[] = [];
  const memberIdByName = new Map<string, string>();
  const sessions: ClassSession[] = [];
  const sessionIdByKey = new Map<string, string>();
  const instructors: { instructor_id: string; display_name: string }[] = [];
  const instructorIdByName = new Map<string, string>();
  const attendance: Attendance[] = [];
  const skipped: string[] = [];
  const idsSeenPerName = new Map<string, Set<string>>();
  /* DISTINCT NAMES, NOT ROWS. Counting rows made one member with a
   * zero-width space in her name and twenty visits report "20 names had
   * invisible characters removed" — twenty times the truth, stated to staff
   * with total confidence, in the disclosure written to warn them about
   * invisible characters. The cleaned name is what identifies the person,
   * so that is what is counted. */
  const cleanedNames = new Set<string>();
  /* Same member, same session, more than once. With a class column that is
   * a duplicated row; without one it is indistinguishable from a second
   * class that day, and the file cannot say which. Counted either way. */
  const seenAttendance = new Set<string>();
  let sameDayRepeats = 0;

  /* Decided ONCE from the whole file, before any row is read: one row with
   * a first component above 12 settles the order for every other row. */
  const dateOrder = detectSlashDateOrder(
    rows.slice(1).map((r) => r.cells[dateCol] ?? ""),
  );

  /* IS THAT COLUMN IDENTIFYING PEOPLE, OR ROWS? THE FILE CANNOT SAY.
   *
   * "id" is in the identity synonyms because plenty of exports name their
   * member key exactly that. Plenty of others use it for the ATTENDANCE
   * ROW — one number per visit — and reading that as identity costs a lot:
   * a member with three visits becomes three members with one visit each,
   * so she never looks like a regular, her prior-attendance ranking
   * collapses, and a four-row file for two people reports four members.
   *
   * The tempting fix is to detect it: every value distinct while some name
   * repeats looks exactly like row numbering. It is also EXACTLY what two
   * different people who share a name look like — "m-100 John Smith" and
   * "m-200 John Smith" is the shape this product already promises to read
   * as two people, on purpose, because names are not identity. The counts
   * cannot separate the two cases, and a guess here either splits one
   * member into many or merges two members into one.
   *
   * So it is not guessed. The identity column keeps winning, which is the
   * documented team decision, and the ambiguity is STATED — the same rule
   * this product applies to every other thing it cannot be sure of. */
  const identityMayCountRows = ((): boolean => {
    if (identityCol === -1) return false;
    const body = rows.slice(1);
    const ids = new Set<string>();
    const names = new Set<string>();
    let filled = 0;
    for (const r of body) {
      const id = (r.cells[identityCol] ?? "").trim().toLowerCase();
      const name = (r.cells[memberCol] ?? "").trim().toLowerCase();
      if (id === "" || name === "") continue;
      filled += 1;
      ids.add(id);
      names.add(name);
    }
    return filled > 0 && ids.size === filled && names.size < filled;
  })();

  /* Said FIRST, because it explains every other number on the page. */
  if (identityMayCountRows) {
    skipped.push(
      `the "${headers[identityCol]}" column holds a different value on every row while the same names repeat. ` +
        `That is what two people sharing a name looks like, and also what a per-visit row number looks like — ` +
        `this file cannot tell them apart. It was read as identity, so if that column numbers VISITS rather than ` +
        `members, each visit became its own member and nobody here will look like a regular.`,
    );
  }
  if (dateOrder === "contradictory") {
    skipped.push(
      "the date column contains both DD/MM and MM/DD rows — some value above 12 appears in each position, " +
        "so no single reading fits the file. Convert the dates to YYYY-MM-DD and import again.",
    );
  }
  if (unterminatedQuoteAtLine !== null) {
    skipped.push(
      `line ${unterminatedQuoteAtLine}: a quote opens here and never closes, so everything after it ` +
        `was read as one cell. Rows below this line were not read at all — fix the quote and import again.`,
    );
  }

  for (let r = 1; r < rows.length; r += 1) {
    const { cells, line } = rows[r] ?? { cells: [], line: 0 };
    const rawName = (cells[memberCol] ?? "").trim();
    const name = cleanName(rawName);
    /* A row whose name was ENTIRELY invisible cleans to nothing, produces
     * no member, and is already reported as "empty member name" below.
     * Counting it here too would report the same row twice under two
     * different disclosures — and would count a member who does not exist. */
    if (name !== rawName && name !== "") cleanedNames.add(name.toLowerCase());
    const date = normalizeDate(cells[dateCol] ?? "", dateOrder);
    if (name === "") {
      skipped.push(`line ${line}: empty member name`);
      continue;
    }
    if (!date) {
      skipped.push(`line ${line}: unreadable or impossible date "${(cells[dateCol] ?? "").trim()}" (use YYYY-MM-DD or M/D/YYYY)`);
      continue;
    }
    const classType = classCol === -1 ? GENERIC_CLASS_TYPE : (cells[classCol] ?? "").trim() || GENERIC_CLASS_TYPE;
    const instructorName = instructorCol === -1 ? "" : (cells[instructorCol] ?? "").trim();

    // Identity: the stable identifier when the export carries one, the
    // name otherwise. A blank identifier cell falls back to that row's
    // name rather than collapsing every blank into one person.
    //
    // The key is NAMESPACED by source ("id:" vs "name:") so an identifier
    // whose value happens to equal somebody's name can never collide with
    // that person. Normalization is deliberately minimal — trim and
    // case-fold, nothing more: anything cleverer (stripping dots from an
    // email, collapsing punctuation in a name) would merge people the
    // studio considers distinct, which is inventing identity rather than
    // reading it.
    const rawIdentity = identityCol === -1 ? "" : (cells[identityCol] ?? "").trim();
    const nameKey = rawIdentity !== ""
      ? `id:${rawIdentity.toLowerCase()}`
      : `name:${name.toLowerCase()}`;
    let memberId = memberIdByName.get(nameKey);
    if (memberId === undefined) {
      memberId = `csv_m_${memberIdByName.size + 1}_${slug(name) || "member"}`;
      memberIdByName.set(nameKey, memberId);
      members.push({ member_id: memberId, display_name: name, membership_status: "active" });
    }
    /* A HALF-FILLED IDENTIFIER COLUMN SPLITS A PERSON IN TWO. One row
     * carries the id and keys on "id:123"; the next leaves the cell blank
     * and keys on "name:maria santos". Same human, two records, visits
     * divided between them — and the half with the older last visit can
     * cross the quiet threshold and be flagged while the whole person has
     * been coming in all along. Recorded per name so the page can say it. */
    let idsForName = idsSeenPerName.get(name.toLowerCase());
    if (idsForName === undefined) {
      idsForName = new Set<string>();
      idsSeenPerName.set(name.toLowerCase(), idsForName);
    }
    idsForName.add(memberId);

    let instructorId = "";
    if (instructorName !== "") {
      const instKey = instructorName.toLowerCase();
      instructorId = instructorIdByName.get(instKey) ?? "";
      if (instructorId === "") {
        instructorId = `csv_i_${instructorIdByName.size + 1}_${slug(instructorName) || "instructor"}`;
        instructorIdByName.set(instKey, instructorId);
        instructors.push({ instructor_id: instructorId, display_name: instructorName });
      }
    }

    const sessionKey = `${date}|${classType.toLowerCase()}|${instructorName.toLowerCase()}`;
    let sessionId = sessionIdByKey.get(sessionKey);
    if (sessionId === undefined) {
      sessionId = `csv_s_${sessionIdByKey.size + 1}_${date}`;
      sessionIdByKey.set(sessionKey, sessionId);
      sessions.push({
        session_id: sessionId,
        class_type: classType,
        level: "all levels",
        instructor_id: instructorId,
        starts_at: `${date}T00:00:00`,
        ends_at: `${date}T00:00:00`,
        capacity: 0,
        session_status: "completed",
      });
    }

    const attendanceKey = `${memberId}|${sessionId}`;
    if (seenAttendance.has(attendanceKey)) sameDayRepeats += 1;
    seenAttendance.add(attendanceKey);
    attendance.push({
      attendance_id: `csv_a_${attendance.length + 1}`,
      member_id: memberId,
      session_id: sessionId,
      attendance_status: statusCol === -1 ? "attended" : normalizeStatus(cells[statusCol] ?? ""),
      recorded_at: `${date}T00:00:00`,
    });
  }

  const records: FixtureSet = {
    timezone: timeZone,
    note: "Imported attendance — this data stays in this browser.",
    members,
    memberships: [],
    instructors,
    class_sessions: sessions,
    reservations: [],
    attendance,
    studio_policies: [],
  };

  const identityIsName = identityCol === -1;
  const splitIdentities: string[] = [];
  for (const [lowered, ids] of idsSeenPerName) {
    if (ids.size < 2) continue;
    const shown = members.find((m) => m.display_name.toLowerCase() === lowered)?.display_name ?? lowered;
    splitIdentities.push(
      `${shown} was read as ${ids.size} different people — the identifier column is filled on some of their rows and blank on others, so their visits are split and a flag for either half may be wrong.`,
    );
  }

  return {
    records,
    rowCount: rows.length - 1,
    memberCount: members.length,
    skipped,
    splitIdentities,
    namesCleaned: cleanedNames.size,
    sameDayRepeats,
    classColumnMissing: classCol === -1,
    dateOrder,
    identityIsName,
    identityMethod: identityIsName
      ? "member name (add a member id or email column for exact matching)"
      : `the "${headers[identityCol]}" column`,
    identityMayCountRows,
  };
}
