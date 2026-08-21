import fs from "node:fs/promises";
const DIR = "/Users/Rensley/Desktop/pulseStudio/PulseStudio/app/shared/synthetic/";
globalThis.fetch = async (u) => {
  const name = String(u).replace(/^\.\//, "");
  const text = await fs.readFile(DIR + name, "utf8");
  return { text: async () => text, ok: true };
};
globalThis.document = { querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
await import(DIR + "tests.js");
