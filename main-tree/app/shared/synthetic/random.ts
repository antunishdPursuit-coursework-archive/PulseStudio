/* Deterministic randomness with INDEPENDENT NAMED STREAMS. TEAM-OWNED.
 *
 * Every subsystem draws from its own stream, seeded by (seed, streamName),
 * so streams cannot perturb each other: changing the name pool must not
 * reshuffle attendance, and it cannot — identity draws come from identity
 * streams, behavior draws from per-member behavior streams. The engine
 * never reads the runtime clock; determinism is the whole point.
 */

/** FNV-1a 32-bit over the seed text — spreads similar seeds apart. */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Stream {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

/** mulberry32 over a hash of `seed::streamName`. Same inputs, same
 *  sequence, forever. */
export function makeStream(seed: string, streamName: string): Stream {
  let a = hashText(`${seed}::${streamName}`);
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(lo: number, hi: number): number {
      if (hi < lo) throw new Error(`int(${lo}, ${hi}): empty range`);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("pick() from an empty list");
      return items[Math.floor(next() * items.length)] as T;
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
  };
}
