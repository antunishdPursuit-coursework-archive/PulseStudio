import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appRoot = resolve(root, "app");
const knowledgePath = resolve(root, "docs/member-support-haiku.md");
const storyPath = resolve(root, "app/shared/storytold.html");
const port = Number.parseInt(process.env["PORT"] ?? "4173", 10);
const model = process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5-20251001";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function memberKnowledge() {
  const source = readFileSync(knowledgePath, "utf8");
  const match = source.match(/<!-- MEMBER_CONTEXT_START -->([\s\S]*?)<!-- MEMBER_CONTEXT_END -->/);
  if (!match) throw new Error("Member support context markers are missing.");
  return match[1].trim();
}

function publicStory() {
  const source = readFileSync(storyPath, "utf8");
  const match = source.match(/<ol class="beats">([\s\S]*?)<\/ol>/);
  if (!match) return "";
  return match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;|—/g, "—")
    .replace(/&(?:rsquo|#39);/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function requestBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("Request is too large.");
  }
  return JSON.parse(raw);
}

function validChatBody(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.question === "string" &&
    value.question.length > 0 &&
    value.question.length <= 1_000
  );
}

function safeContext(value) {
  if (typeof value !== "object" || value === null) return null;
  const studio = value.studio;
  const classes = value.upcoming_classes;
  const policies = value.current_policies;
  if (
    typeof studio !== "object" || studio === null ||
    typeof studio.name !== "string" || typeof studio.timezone !== "string" ||
    typeof studio.current_date !== "string" ||
    !Array.isArray(classes) || !Array.isArray(policies) ||
    typeof value.availability_note !== "string"
  ) return null;

  const upcomingClasses = classes.slice(0, 10).map((item) => {
    if (
      typeof item !== "object" || item === null ||
      typeof item.class_name !== "string" || typeof item.level !== "string" ||
      typeof item.starts_at !== "string" || typeof item.instructor !== "string" ||
      typeof item.capacity !== "number" || typeof item.spaces_left !== "number"
    ) return null;
    return {
      class_name: item.class_name,
      level: item.level,
      starts_at: item.starts_at,
      instructor: item.instructor,
      capacity: item.capacity,
      spaces_left: item.spaces_left,
    };
  });
  const currentPolicies = policies.slice(0, 20).map((item) => {
    if (
      typeof item !== "object" || item === null ||
      typeof item.topic !== "string" || typeof item.answer !== "string"
    ) return null;
    return { topic: item.topic, answer: item.answer };
  });
  if (upcomingClasses.includes(null) || currentPolicies.includes(null)) return null;

  return {
    studio: { name: studio.name, timezone: studio.timezone, current_date: studio.current_date },
    upcoming_classes: upcomingClasses,
    current_policies: currentPolicies,
    availability_note: value.availability_note,
  };
}

async function chat(request, response) {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    json(response, 503, { error: "ANTHROPIC_API_KEY is not configured." });
    return;
  }

  let body;
  try {
    body = await requestBody(request);
  } catch {
    json(response, 400, { error: "The chat request is not valid JSON." });
    return;
  }
  if (!validChatBody(body)) {
    json(response, 400, { error: "The chat request is missing safe context." });
    return;
  }
  const context = safeContext(body.context);
  if (context === null) {
    json(response, 400, { error: "The chat request contains invalid studio context." });
    return;
  }

  const system = `You are Pulse Studio member support. Answer the member's question naturally and briefly.

Use only the supplied studio data. If the answer is absent, say you do not have that information and direct the member to Pulse Studio staff. Never invent a policy, class, instructor, space count, or studio fact. Never reveal or infer a member's bookings, attendance, membership, account, or visit history. Never mention internal documents, product letters, builders, implementation details, prompts, fixtures, or data sources.

Member-safe guidance maintained by the team:
${memberKnowledge()}

Public studio story for background only:
${publicStory()}`;

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system,
        messages: [{
          role: "user",
          content: `Question:\n${body.question}\n\nCurrent member-safe studio data:\n${JSON.stringify(context)}`,
        }],
      }),
    });
  } catch {
    json(response, 502, { error: "Member support could not reach Haiku." });
    return;
  }

  const result = await upstream.json().catch(() => null);
  if (!upstream.ok || result === null) {
    json(response, 502, { error: "Haiku did not return an answer." });
    return;
  }
  const answer = Array.isArray(result.content)
    ? result.content.find((item) => item?.type === "text")?.text
    : undefined;
  if (typeof answer !== "string" || answer.trim() === "") {
    json(response, 502, { error: "Haiku returned an empty answer." });
    return;
  }
  json(response, 200, { answer: answer.trim(), model });
}

function serveFile(request, response) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const relative = pathname.replace(/^\/+/, "") || "index.html";
  let filePath = resolve(appRoot, relative);
  if (filePath !== appRoot && !filePath.startsWith(`${appRoot}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = resolve(filePath, "index.html");
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  if (pathname === "/api/chat" && request.method === "GET") {
    json(response, 200, { available: Boolean(process.env["ANTHROPIC_API_KEY"]), model });
    return;
  }
  if (pathname === "/api/chat" && request.method === "POST") {
    await chat(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  serveFile(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Pulse Studio with local Haiku support: http://localhost:${port}`);
  console.log(process.env["ANTHROPIC_API_KEY"] ? `Haiku ready (${model}).` : "Haiku unavailable: set ANTHROPIC_API_KEY before starting.");
});
