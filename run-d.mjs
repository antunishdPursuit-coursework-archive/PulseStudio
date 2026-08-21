import fs from "node:fs/promises";
const ROOT = "/Users/Rensley/Desktop/pulseStudio/PulseStudio/app/";
globalThis.fetch = async (u) => {
  let n = String(u).replace(/^\.\//, "");
  const text = await fs.readFile(ROOT + "products/d-reengagement/" + n, "utf8");
  return { text: async () => text, json: async () => JSON.parse(text), ok: true };
};
globalThis.document = { querySelector: () => null };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k,v)=>store.set(k,String(v)), removeItem:(k)=>store.delete(k) };
await import(ROOT + "products/d-reengagement/tests.js");
