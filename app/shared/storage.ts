/* Pulse Studio — guarded browser storage. TEAM-OWNED.
 *
 * WHY THIS EXISTS. Three modules had written the same four functions, and
 * they did not agree. theme-boot.ts and Product D's main.ts each carried a
 * readStored / writeStored / clearStored / storageWorks set; Product A's
 * reservations.ts calls localStorage.setItem with no guard at all (its
 * owner's lane, named in docs/REQUESTFOR-A-B-C.md rather than fixed here).
 * That is the shape color.ts and today.ts were written to undo: the same
 * rule in more than one place is more than one rule to keep true, and it
 * had already gone wrong once — see the split try below.
 *
 * STORAGE IS A PRIVILEGE, NOT A GUARANTEE. A browser with site data blocked
 * — a private window, an enterprise policy, a sandboxed frame — throws on
 * the very ACCESS to localStorage, not merely on the write. An unguarded
 * read at the top of a module that runs on every page does not degrade one
 * feature: it aborts the module, and every page loses its header controls
 * at once. So every door here is guarded, and a refusal to remember is
 * reported as "nothing remembered" rather than thrown.
 *
 * NOTHING HERE DECIDES WHAT TO DO ABOUT IT. These functions report; the
 * caller states the limit to the person reading the page. That is the
 * language law's stated negative, and it is why writeStored returns a
 * boolean instead of swallowing the failure.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/* The proof seam, the same one auth/session.ts uses: a check swaps in a
 * storage that throws where a real one would, and proves the page survives
 * it. Nothing on a live page ever calls this. */
let storageOverride: StorageLike | null = null;
export function setStorageForChecks(storage: StorageLike | null): void {
  storageOverride = storage;
}
function store(): StorageLike {
  return storageOverride ?? localStorage;
}

/** The value, or null — which means "not there" AND "cannot look", because
 *  a caller cannot act differently on those two and pretending otherwise
 *  would invent a distinction the browser does not offer. */
export function readStored(key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

/** True when the value was actually written. Callers that show a person a
 *  result use it to avoid claiming a choice was remembered when it was not. */
export function writeStored(key: string, value: string): boolean {
  try {
    store().setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** True when the key is gone — including when it was never there. False
 *  means the browser refused, which a caller may need to say out loud:
 *  "cleared" and "could not clear" are different promises. */
export function clearStored(key: string): boolean {
  try {
    store().removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** The key this probe writes and takes straight back out. Named as a
 *  constant because app/shared/CLAUDE.md records that the cross-tab session
 *  listener deliberately IGNORES it — a listener waking on every key would
 *  re-render four products whenever any one of them touched storage. */
export const PROBE_KEY = "pulse-storage-probe";

/** Will this browser remember anything at all?
 *
 *  THE WRITE IS THE QUESTION; THE CLEANUP IS NOT. Wrapping both in one try
 *  meant a store that ACCEPTED the write and refused the delete reported
 *  "this browser is not saving site data" — the exact opposite of what had
 *  just happened. Product D found that and split them; this is that fix,
 *  now in the only copy.
 *
 *  A read cannot answer this: getItem returns null both for a blocked store
 *  and for an empty one. Only a write can tell them apart, which is why the
 *  probe exists at all. If it is ever left behind it is harmless — nothing
 *  in this repo reads that key. */
export function storageWorks(): boolean {
  try {
    store().setItem(PROBE_KEY, "1");
  } catch {
    return false;
  }
  clearStored(PROBE_KEY);
  return true;
}
