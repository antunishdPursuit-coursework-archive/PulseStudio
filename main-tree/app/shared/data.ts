/* Pulse Studio — the one shared fixture loader.
   TEAM-OWNED. Every product reads the shared data through this function so
   all four read the same records the same way — no product keeps its own
   copy of shared data or invents its own loader. */

import type { FixtureSet } from "./contract.js";

export async function loadFixtures(): Promise<FixtureSet> {
  const url = new URL("./fixtures.json", import.meta.url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fixtures.json failed to load: HTTP ${res.status}`);
  }
  return (await res.json()) as FixtureSet;
}
