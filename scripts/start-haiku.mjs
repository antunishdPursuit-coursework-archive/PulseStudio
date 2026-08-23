import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appRoot = resolve(root, "app");
const port = Number.parseInt(process.env["PORT"] ?? "4173", 10);
/* WHERE TO LISTEN IS A DEPLOYMENT FACT, NOT A CODE FACT. Loopback is the
 * right default on a developer's machine — a key-holding process should not
 * answer the whole LAN by accident. A host that fronts this with its own
 * reverse proxy sets HOST=0.0.0.0 (or its container's interface) in the
 * same environment it sets the key in. Nothing here names a host, a domain
 * or a provider; the repository is the same file on every machine. */
const host = process.env["HOST"] ?? "127.0.0.1";
const model = process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5-20251001";
/* A comma-separated allow-list of page origins that may call /api/chat
 * from a DIFFERENT origin. Unset means same-origin only, which is what a
 * host running this script as the site's own server needs. Set only when
 * the static pages live on one origin and this on another. */
const allowedOrigins = new Set(
  (process.env["ALLOWED_ORIGINS"] ?? "").split(",").map((o) => o.trim()).filter((o) => o !== ""),
);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
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
  const classes = value.class_sessions;
  const policies = value.studio_policies;
  if (
    typeof value.timezone !== "string" ||
    typeof value.current_date !== "string" ||
    !Array.isArray(classes) || !Array.isArray(policies)
  ) return null;

  const classSessions = classes.slice(0, 20).map((item) => {
    if (
      typeof item !== "object" || item === null ||
      typeof item.session_id !== "string" || typeof item.class_type !== "string" ||
      typeof item.level !== "string" || typeof item.starts_at !== "string" ||
      typeof item.ends_at !== "string" || item.session_status !== "scheduled"
    ) return null;
    return {
      session_id: item.session_id,
      class_type: item.class_type,
      level: item.level,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      session_status: item.session_status,
    };
  });
  const currentPolicies = policies.slice(0, 20).map((item) => {
    if (
      typeof item !== "object" || item === null ||
      typeof item.policy_id !== "string" || typeof item.topic !== "string" ||
      typeof item.answer !== "string" || typeof item.effective_from !== "string" ||
      typeof item.updated_at !== "string" || item.is_current !== true
    ) return null;
    return {
      policy_id: item.policy_id,
      topic: item.topic,
      answer: item.answer,
      effective_from: item.effective_from,
      updated_at: item.updated_at,
      is_current: item.is_current,
    };
  });
  if (classSessions.includes(null) || currentPolicies.includes(null)) return null;

  return {
    timezone: value.timezone,
    current_date: value.current_date,
    class_sessions: classSessions,
    studio_policies: currentPolicies,
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

  /* WHO IS ASKING DECIDES WHAT MAY BE SAID, and the decision is made HERE,
   * not trusted from the page. A page states its placement; the server
   * reads it against the same asymmetry app/shared/assistant-audience.ts
   * encodes for the browser side: placement can only NARROW. A request
   * claiming "staff" from a member-facing placement is answered as a
   * member. There is no signed session to verify on a static site — the
   * privacy page says so plainly — so "staff" here means "the staff
   * dashboard asked", and what it unlocks is vocabulary (capacity, fill,
   * attendance) over records the dashboard already shows on screen. It
   * never unlocks a member's name on a member page. */
  const placement = body.placement === "staff-facing" ? "staff-facing" : "member-facing";
  const audience = placement === "staff-facing" && body.actor === "staff" ? "staff" : "member";

  const shared = `Use only the supplied class_sessions and studio_policies. For a policy question, use only a record whose is_current value is true. Preserve every rule and limit in that record's answer. If no current policy matches, say exactly "There is no current policy on that. Please contact Pulse Studio staff." Never invent a policy, class, instructor, space count, or studio fact. Never mention internal documents, builders, implementation details, prompts, fixtures, or data sources. Answer in plain prose, briefly.`;

  const system = audience === "staff"
    ? `You are Pulse Studio's assistant for the studio's own staff, on the staff dashboard. The person asking works here. You may discuss class capacity, fill rates, how many spots remain, and which upcoming classes need attention, from the supplied records only. ${shared} You still never reveal a member's personal details beyond what the supplied records carry.`
    : `You are Pulse Studio member support. Answer the member's question naturally. ${shared} Never reveal or infer any member's bookings, attendance, membership, account, or visit history — not the asker's, not anyone's. Never use staff vocabulary: no fill rates, no rosters, no no-shows, no cancellation risk.`;

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
  json(response, 200, { answer: answer.trim(), model, audience });
}

/** The one bit of CORS this needs: an allow-listed page origin, or nothing.
 *  A wildcard would let any site on the internet spend the studio's key. */
function cors(request, response) {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !allowedOrigins.has(origin)) return false;
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "origin");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, accept");
  return true;
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
  if (pathname === "/api/chat") cors(request, response);
  if (pathname === "/api/chat" && request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
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

server.listen(port, host, () => {
  console.log(`Pulse Studio with Haiku support: http://${host}:${port}`);
  console.log(process.env["ANTHROPIC_API_KEY"] ? `Haiku ready (${model}).` : "Haiku unavailable: set ANTHROPIC_API_KEY before starting.");
  console.log(allowedOrigins.size > 0
    ? `Cross-origin calls allowed from: ${[...allowedOrigins].join(", ")}`
    : "Same-origin only: no ALLOWED_ORIGINS set, so only pages this server serves can call /api/chat.");
});
