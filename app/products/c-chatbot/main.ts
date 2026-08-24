import type { PublicFixtures } from "../../shared/contract.js";
import { loadFixtures } from "../../shared/data.js";
import { answerProblems, audiencePolicy } from "../../shared/assistant-audience.js";
import { readPulseSession } from "../../shared/auth/session.js";
import { asksForPrivateMemberData, QUESTION_MAX_LENGTH, recordStatus, safeStudioContext } from "./support.js";
import { todayIsoInZone } from "../../shared/today.js";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Member support could not find ${selector}.`);
  return element;
}

const form = requiredElement<HTMLFormElement>("#chat-form");
const input = requiredElement<HTMLInputElement>("#question");
const messages = requiredElement<HTMLElement>("#messages");
const greeting = requiredElement<HTMLParagraphElement>("#greeting");
const scope = requiredElement<HTMLParagraphElement>("#scope");
const status = requiredElement<HTMLParagraphElement>("#status");
const sendButton = requiredElement<HTMLButtonElement>("button[type='submit']");
const CHAT_ENDPOINT = new URL("../../api/chat", import.meta.url);

/* This page is member-facing whoever is signed in: a staff person's screen
 * may be turned toward a member, so the placement narrows the audience and
 * the session can only name the reader. See shared/assistant-audience.ts. */
const PLACEMENT = "member-facing" as const;
const session = readPulseSession();
const policy = audiencePolicy(
  session?.actor_type ?? null,
  PLACEMENT,
  session?.display_name.split(" ")[0] ?? null,
);
greeting.textContent = policy.greeting;
scope.textContent = policy.scope;
input.maxLength = QUESTION_MAX_LENGTH;

let fixtures: PublicFixtures | null = null;

function isChatResponse(value: unknown): value is { answer: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["answer"] === "string"
  );
}

/* Returns the answer AND the server's verdict on whether it named another
   member. The decision is the server's — it holds the roster; the wording
   of a refusal stays here, where the audience policy lives. */
async function haikuAnswer(
  question: string,
  records: PublicFixtures,
  self: string | null,
): Promise<{ answer: string; nameRefused: boolean }> {
  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question,
      /* The asker's OWN name, so the server's roster check never refuses a
         person for hearing their own name back. Nothing else about them. */
      self,
      context: safeStudioContext(records, todayIsoInZone(records.timezone), Date.now()),
    }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !isChatResponse(result)) {
    throw new Error("Conversational member support is unavailable.");
  }
  return {
    answer: result.answer,
    nameRefused: (result as { nameRefused?: unknown }).nameRefused === true,
  };
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

  if (asksForPrivateMemberData(question)) {
    addMessage(policy.refusal, "assistant");
    input.focus();
    return;
  }
  if (fixtures === null) {
    addMessage("The studio schedule and policies are unavailable right now. Please contact Pulse Studio staff for help.", "assistant");
    input.focus();
    return;
  }

  sendButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  status.textContent = "Checking the current studio information.";
  try {
    const { answer, nameRefused } = await haikuAnswer(question, fixtures, session?.display_name ?? null);
    /* THE GUARD IS IN TWO HALVES, IN TWO PLACES, EACH WHERE ITS EVIDENCE
     * IS. The staff-vocabulary half runs here on the finished text. The
     * NAME half runs on the server, because it needs the studio's roster
     * and this is a member-facing page — downloading every member's name in
     * order to protect member names was a bigger leak than the one it
     * prevented, and the data law forbids it outright. The server sends
     * back a verdict, never the roster and never the name it matched. */
    addMessage(
      nameRefused || answerProblems(answer, policy, []).length > 0 ? policy.refusal : answer,
      "assistant",
    );
    status.textContent = recordStatus(fixtures, Date.now(), true);
  } catch {
    addMessage("Conversational member support is unavailable right now. Please contact Pulse Studio staff for help.", "assistant");
    status.textContent = recordStatus(fixtures, Date.now(), false);
  } finally {
    sendButton.disabled = false;
    form.removeAttribute("aria-busy");
    input.focus();
  }
});

async function start(): Promise<void> {
  try {
    fixtures = await loadFixtures();
  } catch {
    status.textContent = "The studio schedule and policies are unavailable right now.";
    sendButton.disabled = true;
    return;
  }

  let available = false;
  try {
    const response = await fetch(CHAT_ENDPOINT, { headers: { accept: "application/json" } });
    const result: unknown = await response.json();
    available = response.ok && typeof result === "object" && result !== null && (result as Record<string, unknown>)["available"] === true;
  } catch {
    available = false;
  }
  status.textContent = recordStatus(fixtures, Date.now(), available);
  if (!available) {
    /* The greeting must not invite a conversation the site cannot hold:
     * before this, the bubble said "Ask me" above a status line saying it
     * could not answer. Lead with what the page still has. */
    greeting.textContent = "The studio's schedule and policies are loaded, but I can't hold a conversation on this site yet. The front desk can answer anything urgent.";
  }
}

void start();
