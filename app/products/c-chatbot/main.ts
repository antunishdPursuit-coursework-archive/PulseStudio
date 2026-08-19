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

function formatSession(session: SyntheticClassSession, includeSpaces: boolean): string {
  const type = classTypeById.get(session.classTypeId);
  const instructor = instructorById.get(session.instructorId);
  const booked = dataset.bookings.filter(
    (booking) => booking.classSessionId === session.id && booking.status === "booked",
  ).length;
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: dataset.meta.timezone,
  }).format(new Date(`${session.startsAt}-04:00`));
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

function answer(question: string, records: SyntheticDataset): string {
  const normalized = question.toLowerCase().trim();
  const policy = policyAnswer(normalized);
  if (policy) return policy;

  const asksSchedule = ["class", "schedule", "available", "space", "spot", "instructor", "yoga", "cycling", "hiit", "pilates", "strength"]
    .some((word) => normalized.includes(word));
  if (asksSchedule) {
    const sessions = upcomingSessions(normalized);
    if (sessions.length === 0) return "I checked the upcoming schedule, but no matching classes were found.";
    const includeSpaces = ["available", "space", "spot", "full"].some((word) => normalized.includes(word));
    return `Here are the next ${sessions.length} matching classes:\n${sessions.map((session) => `• ${formatSession(session, includeSpaces)}`).join("\n")}`;
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
