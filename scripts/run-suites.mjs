#!/usr/bin/env node
/* Pulse Studio — run every browser unit suite headlessly, in Node.
 *
 * WHY THIS EXISTS. The three suites (synthetic, auth, re-engagement) are
 * written to run in a browser tab: each has a tests.html that loads its
 * tests.js and paints the results into the page. That is a good way for a
 * human to read them and a useless way for CI to check them — a suite that
 * only runs when somebody remembers to open a tab is a suite that can go red
 * unnoticed. This script gives those same suites a second way to run, so
 * `npm run check` can fail on a broken check instead of shrugging.
 *
 * It replaces eleven throwaway run-*.mjs files that used to sit in the repo
 * root, each hardcoding an absolute path from one developer's Mac. The
 * technique in three of them was worth keeping; the files were not.
 *
 * HOW IT WORKS. Each suite runs in its OWN child process. That is not
 * caution for its own sake: a browser gives every tests.html a fresh page,
 * and these suites write to localStorage. Sharing one Node module registry
 * would let one suite's leftover session decide another suite's result —
 * a false green that looks exactly like a real one.
 *
 * HONEST LIMITS. The DOM here is a stub, not a browser: it records what the
 * suites write and nothing more. These checks exercise LOGIC. Anything about
 * real layout, real styling, or real event dispatch is still only proven by
 * opening the tests.html pages in a browser.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { nodeTooOldNote } from "./node-floor.mjs";

// Repo-relative, like scripts/check-styles.mjs — never an absolute path from
// somebody's home directory. A script a teammate cannot run is not tooling.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The marker the child prints before its JSON, so ordinary console output
// from a suite can never be mistaken for the result payload.
const RESULT_MARKER = "___RUN_SUITES_RESULT___";

const SUITES = [
  { key: "synthetic", dir: "app/shared/synthetic", label: "synthetic studio engine" },
  { key: "auth", dir: "app/shared/auth", label: "session contract" },
  { key: "reengagement", dir: "app/products/d-reengagement", label: "member re-engagement" },
];

/* The stub DOM.
 *
 * WHAT CHANGED AND WHY. This used to be four methods on one class: append,
 * appendChild, textContent, classList.add. That was enough for suites that
 * only ever wrote a result line into a page, and it silently stopped being
 * enough the moment a shared COMPONENT became worth checking. The footer and
 * the alert box are built in TypeScript, appended to all thirteen pages by
 * theme-boot, and every property worth pinning about them — which links they
 * carry, which page is marked current, whether raising one condition twice
 * stacks two boxes — is a property of a DOM tree. With the old stub those
 * checks did not fail honestly; they threw "Cannot set properties of
 * undefined", which reads as a broken runner rather than a broken check.
 *
 * So this is a small real tree: parents, children, attributes, and a
 * selector engine. It is still NOT a browser, and the difference is the
 * whole reason to read this comment before trusting a green:
 *
 *   - No layout, no styles, no computed values. Nothing here can tell you a
 *     footer is legible, or even visible. Only a browser can.
 *   - No event dispatch. Listeners are recorded and never fired.
 *   - `a.href` is whatever was assigned. A real browser resolves it against
 *     the document; every module here assigns an already-absolute URL, and
 *     a module that stopped doing so would pass here and break in a tab.
 *   - The selector engine handles tag, #id, .class, [attr], [attr="v"],
 *     [attr~="v"], compounds of those, descendant and child combinators,
 *     and comma lists. ANYTHING ELSE THROWS. That refusal is the important
 *     part: a stub that answered "no matches" to a selector it did not
 *     understand would turn every check using one into a silent pass, which
 *     is the exact failure this file exists to prevent.
 */
function installBrowserStubs(baseDir) {
  const SIMPLE = /^(\*|[a-zA-Z][\w-]*)?((?:[#.][\w-]+|\[[\w-]+(?:[~]?="[^"]*")?\])*)$/;
  const PIECE = /[#.][\w-]+|\[[\w-]+(?:[~]?="[^"]*")?\]/g;

  /** One simple selector -> a predicate, or a throw if we cannot read it. */
  function compileSimple(text) {
    const match = SIMPLE.exec(text);
    if (match === null) {
      throw new Error(
        `run-suites stub DOM cannot parse the selector "${text}". Add support ` +
          "for it here rather than letting the check pass by matching nothing.",
      );
    }
    const tag = match[1] && match[1] !== "*" ? match[1].toUpperCase() : null;
    const tests = [];
    for (const piece of (match[2] ?? "").match(PIECE) ?? []) {
      if (piece.startsWith("#")) {
        const id = piece.slice(1);
        tests.push((el) => el.getAttribute("id") === id);
      } else if (piece.startsWith(".")) {
        const cls = piece.slice(1);
        tests.push((el) => el.classList.contains(cls));
      } else {
        const body = piece.slice(1, -1);
        const eq = body.indexOf("=");
        if (eq < 0) {
          tests.push((el) => el.hasAttribute(body));
        } else {
          const tilde = body[eq - 1] === "~";
          const name = body.slice(0, tilde ? eq - 1 : eq);
          const want = body.slice(eq + 1).replace(/^"|"$/g, "");
          tests.push((el) => {
            const value = el.getAttribute(name);
            if (value === null) return false;
            return tilde ? value.split(/\s+/).includes(want) : value === want;
          });
        }
      }
    }
    return (el) => (tag === null || el.tagName === tag) && tests.every((t) => t(el));
  }

  /** "a b > c" -> the chain, innermost last. */
  function compile(selector) {
    return selector.split(",").map((branch) => {
      const parts = branch.trim().split(/\s+/);
      const chain = [];
      let combinator = "descendant";
      for (const part of parts) {
        if (part === ">") { combinator = "child"; continue; }
        chain.push({ match: compileSimple(part), combinator });
        combinator = "descendant";
      }
      if (chain.length === 0) throw new Error(`run-suites stub DOM got an empty selector`);
      return chain;
    });
  }

  function matchesChain(el, chain) {
    const last = chain[chain.length - 1];
    if (!last.match(el)) return false;
    let node = el;
    for (let i = chain.length - 2; i >= 0; i -= 1) {
      const step = chain[i + 1];
      if (step.combinator === "child") {
        node = node.parentNode;
        if (node === null || !chain[i].match(node)) return false;
      } else {
        node = node.parentNode;
        while (node !== null && !chain[i].match(node)) node = node.parentNode;
        if (node === null) return false;
      }
    }
    return true;
  }

  class StubElement {
    constructor(tagName = "div") {
      this.tagName = String(tagName).toUpperCase();
      /* One array, used as both childNodes and children: this tree holds
       * elements only, with text kept as a string on the parent. `children`
       * therefore stays a plain array, which the --self-test below pushes a
       * bare object onto. */
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.listeners = [];
      this.ownText = "";
      const element = this;
      this.classList = {
        add(...names) {
          const set = new Set(element.className.split(/\s+/).filter(Boolean));
          for (const n of names) set.add(n);
          element.className = [...set].join(" ");
        },
        remove(...names) {
          const set = new Set(element.className.split(/\s+/).filter(Boolean));
          for (const n of names) set.delete(n);
          element.className = [...set].join(" ");
        },
        contains: (name) => element.className.split(/\s+/).includes(name),
      };
      /* data-* both ways, the way a real dataset does: dataset.alertId is
       * the attribute data-alert-id. */
      this.dataset = new Proxy({}, {
        get: (_t, key) => element.getAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`) ?? undefined,
        set: (_t, key, value) => {
          element.setAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(value));
          return true;
        },
        deleteProperty: (_t, key) => {
          element.attributes.delete(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
          return true;
        },
        has: (_t, key) => element.hasAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
      });
    }

    get className() { return this.attributes.get("class") ?? ""; }
    set className(value) { this.attributes.set("class", String(value)); }
    get id() { return this.attributes.get("id") ?? ""; }
    set id(value) { this.attributes.set("id", String(value)); }

    /* THESE PROPERTIES REFLECT TO ATTRIBUTES, because in a real DOM they do:
     * `a.href = x` sets the href content attribute to exactly x, and
     * getAttribute("href") reads it straight back. Without this the tree
     * held the value somewhere no selector and no getAttribute could see —
     * which is how a check asking "is any footer link still relative?" got
     * eight empty strings and reported every link broken. The stub was
     * wrong, not the footer; a stub that lies in this direction is the
     * cheaper kind, but it still has to be fixed rather than worked around
     * in the check. */
    get href() { return this.attributes.get("href") ?? ""; }
    set href(value) { this.attributes.set("href", String(value)); }
    get rel() { return this.attributes.get("rel") ?? ""; }
    set rel(value) { this.attributes.set("rel", String(value)); }
    get type() { return this.attributes.get("type") ?? ""; }
    set type(value) { this.attributes.set("type", String(value)); }
    get src() { return this.attributes.get("src") ?? ""; }
    set src(value) { this.attributes.set("src", String(value)); }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }

    /* Setting text clears children, exactly as a real node does; reading it
     * walks the subtree, so a word with a nested span reads as the whole
     * word rather than the first half. */
    set textContent(value) { this.ownText = String(value); this.children = []; }
    get textContent() { return this.ownText + this.children.map((c) => c.textContent ?? "").join(""); }

    #adopt(node) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      return node;
    }
    append(...nodes) { for (const n of nodes) this.children.push(this.#adopt(n)); }
    appendChild(node) { this.children.push(this.#adopt(node)); return node; }
    prepend(...nodes) { for (const n of nodes.reverse()) this.children.unshift(this.#adopt(n)); }
    removeChild(node) {
      const i = this.children.indexOf(node);
      if (i >= 0) this.children.splice(i, 1);
      node.parentNode = null;
      return node;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    after(node) {
      if (this.parentNode === null) return;
      const i = this.parentNode.children.indexOf(this);
      this.parentNode.children.splice(i + 1, 0, this.parentNode.#adopt(node));
    }
    replaceWith(node) {
      if (this.parentNode === null) return;
      const parent = this.parentNode;
      const i = parent.children.indexOf(this);
      parent.children.splice(i, 1, parent.#adopt(node));
      this.parentNode = null;
    }
    addEventListener(type, fn) { this.listeners.push([type, fn]); }

    get descendants() {
      const out = [];
      const walk = (node) => { for (const c of node.children) { if (c instanceof StubElement) { out.push(c); walk(c); } } };
      walk(this);
      return out;
    }
    querySelectorAll(selector) {
      const branches = compile(selector);
      return this.descendants.filter((el) => branches.some((chain) => matchesChain(el, chain)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    closest(selector) {
      const branches = compile(selector);
      let node = this;
      while (node !== null) {
        if (branches.some((chain) => chain.length === 1 && chain[0].match(node))) return node;
        node = node.parentNode;
      }
      return null;
    }
  }

  const body = new StubElement("body");
  const head = new StubElement("head");
  const summary = new StubElement("p");
  summary.id = "summary";
  const results = new StubElement("ul");
  results.id = "results";
  body.append(summary, results);

  globalThis.HTMLElement = StubElement;
  globalThis.SVGSVGElement = StubElement;
  globalThis.document = {
    body,
    head,
    documentElement: new StubElement("html"),
    createElement: (tag) => new StubElement(tag),
    createElementNS: (_ns, tag) => new StubElement(tag),
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    getElementById: (id) => body.querySelector(`#${id}`),
  };
  /* Only what the components actually call. Escaping is a real rule, not a
   * pass-through: an id with a quote in it must not be able to slip out of
   * the attribute selector it is spliced into. */
  globalThis.CSS = {
    escape: (value) => String(value).replace(/[^\w-]/g, (c) => `\\${c}`),
  };

  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  // Cross-tab session events: the auth suite dispatches a StorageEvent to
  // prove one tab sees another tab's sign-out. Without these stubs it reports
  // a failure that is the runner's fault, not the code's.
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    const arr = listeners.get(type) ?? [];
    const index = arr.indexOf(fn);
    if (index >= 0) arr.splice(index, 1);
  };
  globalThis.dispatchEvent = (event) => {
    for (const fn of (listeners.get(event.type) ?? []).slice()) fn(event);
    return true;
  };
  globalThis.StorageEvent = class StorageEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
  globalThis.window = globalThis;

  // Suites fetch their fixture files with page-relative URLs.
  globalThis.fetch = async (url) => {
    const name = String(url).replace(/^\.\//, "");
    return {
      ok: true,
      text: async () => readFile(join(baseDir, name), "utf8"),
      json: async () => JSON.parse(await readFile(join(baseDir, name), "utf8")),
    };
  };

  return { summary, results, StubElement };
}

const SUMMARY_SHAPE = /(\d+)\s+checks run,\s*(\d+)\s+passed,\s*(\d+)\s+failed/;

/** Run ONE suite in this process. Returns {run, passed, failed, failures}. */
async function runSuite(suite) {
  const baseDir = join(ROOT, suite.dir);
  const { summary, results } = installBrowserStubs(baseDir);
  await import(join(baseDir, "tests.js"));

  // Every suite writes "N checks run, P passed, F failed." into #summary.
  const match = SUMMARY_SHAPE.exec(summary.textContent);
  if (!match) {
    throw new Error(
      `the suite ran but wrote no readable summary. Got: ${JSON.stringify(summary.textContent)}`,
    );
  }
  const failures = results.children
    .filter((child) => child.className.includes("fail"))
    .map((child) => child.textContent);
  return { run: +match[1], passed: +match[2], failed: +match[3], failures };
}

/* ---- child mode: run one suite, hand the result back as JSON ---- */
const childSuiteKey = process.argv[2] === "--suite" ? process.argv[3] : null;
if (childSuiteKey) {
  const suite = SUITES.find((entry) => entry.key === childSuiteKey);
  if (!suite) {
    console.error(`run-suites: unknown suite "${childSuiteKey}"`);
    process.exit(2);
  }
  try {
    const result = await runSuite(suite);
    process.stdout.write(RESULT_MARKER + JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error(`${suite.key}: ${error?.message ?? error}`);
    process.exit(2);
  }
}

/* ---- parent mode: run each suite in a child, then report ---- */
let totalRun = 0;
let totalFailed = 0;
let brokenSuites = 0;

for (const suite of SUITES) {
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--suite", suite.key],
    { encoding: "utf8" },
  );
  const marker = child.stdout ? child.stdout.indexOf(RESULT_MARKER) : -1;

  if (child.status !== 0 || marker < 0) {
    // A suite that cannot even run is a failure, never a skip. The most
    // likely cause is that `tsc` has not emitted its tests.js yet.
    brokenSuites += 1;
    const why =
      (child.stderr || "").trim().split("\n").slice(-3).join("\n  ") || "no output";
    console.error(`run-suites: ${suite.key} (${suite.label}) DID NOT RUN\n  ${why}`);
    /* NAME THE REAL CAUSE ONCE. A suite that will not load looks the same
     * whether tsc has not emitted tests.js or Node is too old to read a
     * `.js` file that says `import` — and in the second case Node's own
     * advice ("set type: module in package.json") is wrong for this repo.
     * Said once rather than per suite, because all three fail together. */
    const tooOld = nodeTooOldNote();
    if (tooOld !== null && brokenSuites === 1) console.error(`  ${tooOld}`);
    continue;
  }

  const result = JSON.parse(child.stdout.slice(marker + RESULT_MARKER.length));
  totalRun += result.run;
  totalFailed += result.failed;
  console.log(
    `run-suites: ${suite.label} — ${result.run} checks, ${result.passed} passed, ${result.failed} failed`,
  );
  for (const line of result.failures) console.error(`  ${line}`);
}

if (brokenSuites) {
  console.error(
    `run-suites: ${brokenSuites} suite(s) could not run. These suites import ` +
      "compiled .js, so run `npm run build` before this script.",
  );
  process.exit(1);
}

// Never a silent pass: always state the count that was actually checked.
console.log(
  `run-suites: ${totalRun} checks across ${SUITES.length} suites, ${totalFailed} failed.`,
);

if (process.argv.includes("--self-test")) {
  // Prove the runner can FAIL rather than assuming it — the same standard the
  // styling gate holds itself to (docs/styling.md).
  const { summary, results } = installBrowserStubs(ROOT);
  summary.textContent = "3 checks run, 2 passed, 1 failed.";
  results.children.push({ className: "fail", textContent: "FAIL — planted" });
  const match = SUMMARY_SHAPE.exec(summary.textContent);
  const detected =
    Boolean(match) &&
    Number(match[3]) === 1 &&
    results.children.some((child) => child.className.includes("fail"));
  console.log(
    detected
      ? "run-suites --self-test: PASS — a planted failing check is detected and would exit 1."
      : "run-suites --self-test: BROKEN — a planted failure was NOT detected.",
  );
  if (!detected) process.exit(1);
}

process.exit(totalFailed > 0 ? 1 : 0);
