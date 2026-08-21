/* CSV export — the synthetic studio in the shape a real studio exports. TEAM-OWNED.
 *
 * A front desk exports attendance history as a spreadsheet; so does this.
 * The header uses the vocabulary the re-engagement tool's CSV door already
 * accepts (a stable "member id" column first, so identity is exact), which
 * means a generated studio can walk through the SAME door a real studio's
 * export walks through — and the tool's conclusions can be reconciled
 * against this engine's independent truth metadata.
 *
 * The export mirrors what a desk could actually print: one row per recorded
 * outcome whose class exists and has a readable date. Nothing here uploads
 * anything anywhere — callers hand the text to a local download at most.
 */

import type { SyntheticDataset } from "./contracts.js";
import { dateOfTimestamp, isStrictTimestamp } from "./normalize.js";

/** Quote a field only when it needs it (commas, quotes, line breaks). */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const STATUS_WORDS: Record<string, string> = {
  attended: "attended",
  no_show: "no-show",
  unknown: "unknown",
};

/** Attendance history CSV: member id, member, date, status, class,
 *  instructor — sorted by date then member id, deterministically. */
export function attendanceCsv(dataset: SyntheticDataset): string {
  const memberById = new Map(dataset.members.map((m) => [m.id, m]));
  const sessionById = new Map(dataset.classSessions.map((s) => [s.id, s]));
  const typeById = new Map(dataset.classTypes.map((t) => [t.id, t.name]));
  const instructorById = new Map(
    dataset.instructors.map((i) => [i.id, i.displayName]),
  );

  const rows: Array<[string, string, string, string, string, string]> = [];
  for (const a of dataset.attendance) {
    const member = memberById.get(a.memberId);
    const session = sessionById.get(a.classSessionId);
    if (!member || !session || !isStrictTimestamp(session.startsAt)) continue;
    rows.push([
      member.id,
      member.displayName,
      dateOfTimestamp(session.startsAt),
      STATUS_WORDS[a.status] ?? "unknown",
      typeById.get(session.classTypeId) ?? "class",
      instructorById.get(session.instructorId) ?? "",
    ]);
  }
  rows.sort((x, y) =>
    x[2] === y[2] ? (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0) : x[2] < y[2] ? -1 : 1,
  );

  const lines = ["member id,member,date,status,class,instructor"];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return lines.join("\n") + "\n";
}
