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
const sendButton = requiredElement<HTMLButtonElement>("button[type='submit']");

const BOOKING_LOG_KEY = "pulse-reservations-a";
const CHAT_ENDPOINT = new URL("../../api/chat", import.meta.url);

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

function upcomingSessions(): SyntheticClassSession[] {
  return dataset.classSessions
    .filter((session) => session.status === "scheduled")
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

interface SafeStudioContext {
  studio: { name: string; timezone: string; current_date: string };
  upcoming_classes: Array<{
    class_name: string;
    level: string;
    starts_at: string;
    instructor: string;
    capacity: number;
    spaces_left: number;
  }>;
  current_policies: Array<{ topic: string; answer: string }>;
  availability_note: string;
}

function safeStudioContext(records: SyntheticDataset): SafeStudioContext {
  const upcoming = upcomingSessions();
  return {
    studio: {
      name: records.studio.name,
      timezone: records.studio.timezone,
      current_date: studioDate(),
    },
    upcoming_classes: upcoming.map((session) => {
      const type = classTypeById.get(session.classTypeId);
      return {
        class_name: type?.name ?? "Class",
        level: type?.level ?? "level unavailable",
        starts_at: formatSession(session, false).split(" — ")[1] ?? session.startsAt,
        instructor: instructorById.get(session.instructorId)?.displayName ?? "studio staff",
        capacity: session.capacity,
        spaces_left: Math.max(0, session.capacity - confirmedMemberCount(session.id)),
      };
    }),
    current_policies: records.studioPolicies
      .filter((policy) => policy.isCurrent)
      .map((policy) => ({ topic: policy.topic, answer: policy.answer })),
    availability_note: "Counts include live reservations from this browser and may change as members book or cancel.",
  };
}

function isChatResponse(value: unknown): value is { answer: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["answer"] === "string"
  );
}

async function haikuAnswer(question: string): Promise<string> {
  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, context: safeStudioContext(dataset) }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !isChatResponse(result)) {
    throw new Error("Conversational member support is unavailable.");
  }
  return result.answer;
}

function addMessage(text: string, role: "user" | "assistant"): void {
  const message = document.createElement("p");
  message.className = `message ${role}`;
  message.textContent = text;
  messages.append(message);
  message.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  addMessage(question, "user");
  input.value = "";
  const normalized = question.toLowerCase();
  if (asksForPrivateMemberData(normalized)) {
    addMessage("I can’t provide member accounts, bookings, attendance, or visit history. Please contact Pulse Studio staff for help with private account information.", "assistant");
    input.focus();
    return;
  }

  sendButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  status.textContent = "Checking the current studio information.";
  try {
    addMessage(await haikuAnswer(question), "assistant");
    status.textContent = `${dataset.classSessions.filter((session) => session.status === "scheduled").length} upcoming classes and ${dataset.studioPolicies.filter((policy) => policy.isCurrent).length} current policies available to conversational support.`;
  } catch {
    addMessage("Conversational member support is unavailable right now. Please contact Pulse Studio staff for help.", "assistant");
    status.textContent = "The schedule and policies are ready, but conversational support is unavailable.";
  } finally {
    sendButton.disabled = false;
    form.removeAttribute("aria-busy");
    input.focus();
  }
});

async function reportAvailability(): Promise<void> {
  try {
    const response = await fetch(CHAT_ENDPOINT, { headers: { accept: "application/json" } });
    const result: unknown = await response.json();
    const available = response.ok && typeof result === "object" && result !== null && (result as Record<string, unknown>)["available"] === true;
    status.textContent = available
      ? `${dataset.classSessions.filter((session) => session.status === "scheduled").length} upcoming classes and ${dataset.studioPolicies.filter((policy) => policy.isCurrent).length} current policies available to conversational support.`
      : "The schedule and policies are ready, but conversational support is unavailable.";
  } catch {
    status.textContent = "The schedule and policies are ready, but conversational support is unavailable.";
  }
}

void reportAvailability();
