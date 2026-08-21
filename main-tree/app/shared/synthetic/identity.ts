/* Stable identities and fictional attributes. TEAM-OWNED.
 *
 * Every entity gets an opaque namespaced id; names and emails are
 * attributes only. Names draw from per-member identity streams, so
 * changing the pool can never reshuffle any other stream. All emails use
 * the RFC 2606 reserved .invalid TLD — no real personal information can
 * appear by construction.
 */

import { makeId } from "./contracts.js";
import { makeStream } from "./random.js";
import { normalizeEmail, normalizeName } from "./normalize.js";
import type { CohortPlan } from "./scenarios.js";

export interface NamePool {
  first: readonly string[];
  last: readonly string[];
}

export const DEFAULT_NAME_POOL: NamePool = {
  first: [
    "Maya", "Andre", "Priya", "Diego", "Nina", "Tomas", "Aisha", "Ben",
    "Rosa", "Kwame", "Lena", "Hiro", "Carmen", "Idris", "Sofia", "Noor",
    "Marcus", "Yuki", "Elena", "Rafa", "Zara", "Owen", "Amara", "Luca",
    "Talia", "Jonas", "Mei", "Sam", "Farah", "Iker", "Naomi", "Theo",
    "Ines", "Malik", "Clara", "Ravi", "Bea", "Otto", "Sana", "Gus",
  ],
  last: [
    "Alvarez", "Brooks", "Chen", "Diallo", "Esposito", "Ferreira", "Gupta",
    "Haddad", "Ibarra", "Jensen", "Kowalski", "Lindqvist", "Moreau",
    "Nakamura", "Okonkwo", "Petrov", "Quintero", "Rossi", "Sandoval",
    "Tanaka", "Ueda", "Vargas", "Whitfield", "Ximenez", "Yamada", "Zhang",
    "Amari", "Boateng", "Cardoso", "Delgado",
  ],
};

/** Fixed Unicode names — independent of the pool on purpose, so the
 *  unicode-name scenario is stable under pool substitution. */
const UNICODE_NAMES: readonly string[] = [
  "王伟",
  "佐藤花子",
  "Zoë Ibáñez",
  "Николай Петров",
];

export interface MemberIdentity {
  id: string;
  displayName: string;
  email: string | null;
}

/** One identity per plan, in plan order. Shared-name members reuse the
 *  name minted for their group; unicode members take the fixed names. */
export function buildIdentities(
  seed: string,
  plans: readonly CohortPlan[],
  pool: NamePool,
): MemberIdentity[] {
  const used = new Set<string>();
  const sharedNames = new Map<number, string>();
  let unicodeTaken = 0;

  const identities: MemberIdentity[] = [];
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    if (!plan) continue;
    const stream = makeStream(seed, `identity:${i}`);
    const id = makeId("member", i + 1);

    let displayName = "";
    if (plan.nameKind === "unicode") {
      displayName = UNICODE_NAMES[unicodeTaken % UNICODE_NAMES.length] as string;
      unicodeTaken += 1;
    } else if (plan.nameKind === "shared" && plan.sharedNameGroup !== null) {
      const existing = sharedNames.get(plan.sharedNameGroup);
      if (existing !== undefined) {
        displayName = existing; // the deliberate duplicate — distinct id
      } else {
        displayName = drawUniqueName(stream, pool, used);
        sharedNames.set(plan.sharedNameGroup, displayName);
      }
    } else {
      displayName = drawUniqueName(stream, pool, used);
    }
    used.add(displayName);

    // ~10% of members carry no email — a missing optional identifier is a
    // supported, generated case. The presence draw comes from its OWN
    // stream: the name-drawing retry loop consumes a pool-dependent number
    // of identity draws, and sharing a stream would let a pool substitution
    // flip who has an email — changing more than names, which the options
    // contract forbids. Email text derives from the OPAQUE id, never from
    // the name, so it stays fictional and pool-independent.
    const email = makeStream(seed, `email:${i}`).chance(0.1)
      ? null
      : normalizeEmail(`Member${String(i + 1).padStart(6, "0")}@Members.Pulse.invalid`);

    identities.push({ id, displayName: normalizeName(displayName), email });
  }
  return identities;
}

function drawUniqueName(
  stream: { pick<T>(items: readonly T[]): T },
  pool: NamePool,
  used: Set<string>,
): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = `${stream.pick(pool.first)} ${stream.pick(pool.last)}`;
    if (!used.has(candidate)) return candidate;
  }
  // Tiny pools at 500 members can exhaust politely: fall back to a
  // numbered variant rather than a silent duplicate.
  const base = `${stream.pick(pool.first)} ${stream.pick(pool.last)}`;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
