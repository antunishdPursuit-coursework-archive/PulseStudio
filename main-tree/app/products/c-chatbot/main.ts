import { DEFAULT_CONFIG } from "../../shared/synthetic/config.js";
import type {
  SyntheticClassSession,
  SyntheticDataset,
} from "../../shared/synthetic/contracts.js";
import { generateStudio } from "../../shared/synthetic/generate.js";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Member support could not find ${selector}.`);
  return element;
}

const form = requiredElement<HTMLFormElement>("#chat-form");
const input = requiredElement<HTMLInputElement>("#question");
const messages = requiredElement<HTMLElement>("#messages");
const status = requiredElement<HTMLParagraphElement>("#status");

const BOOKING_LOG_KEY = "pulse-reservations-a";

interface RuntimeReservation {
  reservation_id: string;
  member_id: string;
  session_id: string;
  reservation_status: "reserved" | "waitlisted" | "canceled";
  reserved_at: string;
  canceled_at: string | null;
}

const reservationStatuses: ReadonlySet<string> = new Set([
  "reserved",
  "waitlisted",
  "canceled",
]);

function isRuntimeReservation(value: unknown): value is RuntimeReservation {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["reservation_id"] === "string" &&
    typeof row["member_id"] === "string" &&
    typeof row["session_id"] === "string" &&
    typeof row["reservation_status"] === "string" &&
    reservationStatuses.has(row["reservation_status"] as string) &&
    typeof row["reserved_at"] === "string" &&
    (row["canceled_at"] === null || typeof row["canceled_at"] === "string")
  );
}

function readRuntimeReservations(): RuntimeReservation[] {
  try {
    const raw = localStorage.getItem(BOOKING_LOG_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRuntimeReservation) : [];
  } catch {
    return [];
  }
}

function studioDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const dataset = generateStudio({
  ...DEFAULT_CONFIG,
  asOfDate: studioDate(),
}).dataset;

const classTypeById = new Map(dataset.classTypes.map((item) => [item.id, item]));
const instructorById = new Map(dataset.instructors.map((item) => [item.id, item]));
const privateMemberNames = dataset.members.flatMap((member) => {
  const normalized = member.displayName.toLowerCase();
  const firstName = normalized.split(/\s+/)[0];
  return firstName && firstName.length >= 3 ? [normalized, firstName] : [normalized];
});

function upcomingSessions(question: string): SyntheticClassSession[] {
  const className = dataset.classTypes.find((item) =>
    question.includes(item.name.toLowerCase()),
  )?.name;
  return dataset.classSessions
    .filter((session) => {
      const type = classTypeById.get(session.classTypeId);
      return session.status === "scheduled" && (!className || type?.name === className);
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, 5);
}

function confirmedMemberCount(sessionId: string): number {
  const statusByMember = new Map<string, RuntimeReservation["reservation_status"]>();
  for (const booking of dataset.bookings) {
    if (booking.classSessionId === sessionId && booking.status === "booked") {
      statusByMember.set(booking.memberId, "reserved");
    }
  }
  for (const reservation of readRuntimeReservations()) {
    if (reservation.session_id === sessionId) {
      statusByMember.set(reservation.member_id, reservation.reservation_status);
    }
  }
  return [...statusByMember.values()].filter((value) => value === "reserved").length;
}

function formatSession(session: SyntheticClassSession, includeSpaces: boolean): string {
  const type = classTypeById.get(session.classTypeId);
  const instructor = instructorById.get(session.instructorId);
  const booked = confirmedMemberCount(session.id);
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    // Synthetic timestamps are studio-local wall times without an offset.
    // Format them as written so daylight-saving changes cannot shift an hour.
    timeZone: "UTC",
  }).format(new Date(`${session.startsAt}Z`));
  const spaces = includeSpaces ? `, ${Math.max(0, session.capacity - booked)} spaces left` : "";
  return `${type?.name ?? "Class"} (${type?.level ?? "level unavailable"}) — ${when} with ${instructor?.displayName ?? "studio staff"}${spaces}`;
}

function policyAnswer(question: string): string | null {
  const keywords: Record<string, string[]> = {
    cancellation: ["cancel", "cancellation", "refund"],
    "what to bring": ["bring", "wear", "towel", "mat", "shoes"],
    "class levels": ["level", "beginner", "advanced", "difficulty"],
    "guest passes": ["guest", "friend", "pass"],
    "late arrival": ["late", "arrival", "doors"],
  };
  const topic = Object.entries(keywords).find(([, words]) =>
    words.some((word) => question.includes(word)),
  )?.[0];
  return dataset.studioPolicies.find((policy) => policy.isCurrent && policy.topic === topic)?.answer ?? null;
}

function asksForPrivateMemberData(question: string): boolean {
  if (privateMemberNames.some((name) => question.includes(name))) return true;
  return [
    /\battend(?:ed|ance)?\b/,
    /\bvisit(?:ed|s|ing)?\s+history\b/,
    /\bdid\s+.+\s+(?:come|visit|book|cancel)\b/,
    /\bwhen\s+(?:was|did)\s+.+\s+(?:here|come|visit|book|cancel)\b/,
    /\b(?:my|their|his|her)\s+(?:account|attendance|booking|membership|reservation)\b/,
    /\bmember(?:'s|s')?\s+(?:account|attendance|booking|history|membership|reservation)\b/,
  ].some((pattern) => pattern.test(question));
}

function answer(question: string, records: SyntheticDataset): string {
  const normalized = question.toLowerCase().trim();
  if (asksForPrivateMemberData(normalized)) {
    return "I can’t provide member accounts, bookings, attendance, or visit history. Please contact Pulse Studio staff for help with private account information.";
  }
  const policy = policyAnswer(normalized);
  if (policy) return policy;

  const asksSchedule = ["class", "schedule", "available", "space", "spot", "instructor", "yoga", "cycling", "hiit", "pilates", "strength"]
    .some((word) => normalized.includes(word));
  if (asksSchedule) {
    const sessions = upcomingSessions(normalized);
    if (sessions.length === 0) return "I checked the upcoming schedule, but no matching classes were found.";
    const includeSpaces = ["available", "space", "spot", "full"].some((word) => normalized.includes(word));
    const availabilityNote = includeSpaces
      ? "\nCounts include live reservations from this browser and may change as members book or cancel."
      : "";
    return `Here are the next ${sessions.length} matching classes:\n${sessions.map((session) => `• ${formatSession(session, includeSpaces)}`).join("\n")}${availabilityNote}`;
  }

  return `I can help with the schedule, availability, instructors, class levels, cancellation, what to bring, guest passes, and late arrival. For anything else, please contact ${records.studio.name} staff.`;
}

function addMessage(text: string, role: "user" | "assistant"): void {
  const message = document.createElement("p");
  message.className = `message ${role}`;
  message.textContent = text;
  messages.append(message);
  message.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  addMessage(question, "user");
  addMessage(answer(question, dataset), "assistant");
  input.value = "";
  input.focus();
});

status.textContent = `${dataset.classSessions.filter((session) => session.status === "scheduled").length} upcoming classes and ${dataset.studioPolicies.filter((policy) => policy.isCurrent).length} current policies checked.`;
