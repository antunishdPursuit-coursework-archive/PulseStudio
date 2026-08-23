/* Pulse Studio — the one shared fixture loader.
   TEAM-OWNED. Every product reads the shared data through this function so
   all four read the same records the same way — no product keeps its own
   copy of shared data or invents its own loader.

   IT RETURNS THE PUBLIC HALF ONLY. Records that name a person are not in
   app/shared/fixtures.json any more and are not reachable from a page
   without a staff session — see app/shared/auth/staff-gate.ts. The return
   type says so, so a read of `.members` from here is a compile error rather
   than an undefined at runtime. */

import type { PublicFixtures } from "./contract.js";

export async function loadFixtures(): Promise<PublicFixtures> {
  const url = new URL("./fixtures.json", import.meta.url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fixtures.json failed to load: HTTP ${res.status}`);
  }
  return (await res.json()) as PublicFixtures;
}
