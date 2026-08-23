/* Product D — the ONE file that touches anything outside this folder.
 *
 * THE PORTABILITY SEAM: every other .ts file in this product imports its
 * shared types and its record source from HERE, never from ../../shared
 * directly. To run this product inside a different host — another studio
 * clone, a booking platform, a standalone deploy — edit THIS file alone.
 * The engine (logic.ts), the brand seam (config.ts), the UI (main.ts), and
 * every unit check carry over without a single edit.
 *
 * WHAT A PORTER ACTUALLY RE-POINTS, corrected 2026-08-21 because this
 * paragraph named the wrong function for a while: `sharedStudio` below, and
 * the contract types. This product builds its default records from
 * sharedStudio() through live-studio.ts, and its other two doors from a
 * staff member's own CSV and from its own generator. It does NOT call
 * loadFixtures(); that export sat here as the documented seam while nothing
 * in the product used it, so a porter following the instruction would have
 * re-pointed a function that is never called and found the page unchanged.
 * The export is gone. Product B imports loadFixtures straight from
 * app/shared/data.ts, which is unaffected.
 *
 * The only tethers deps.ts does not carry are presentation-level, by
 * design: the shared theme.css tokens and theme-boot.js script tags in the
 * two HTML files — swap those for your host's stylesheet when porting.
 */

/* The studio's identity — the shared clone seam. This product's brand
 * (config.ts) sources its studioName from here, so renaming the studio is
 * ONE shared file (app/shared/brand.ts); a standalone port re-points this
 * line at its own name. */
export { STUDIO_NAME } from "../../shared/brand.js";
export { todayIsoInZone } from "../../shared/today.js";

/* Guarded browser storage, shared. This product wrote its own four doors
 * and theme-boot wrote the same four, which is two rules to keep true — and
 * they had already diverged, in this product's favour: the split try inside
 * storageWorks was found here first. The implementation moved to shared and
 * kept that fix; this line is the seam a standalone port re-points. */
export { readStored, writeStored, clearStored, storageWorks } from "../../shared/storage.js";

/* The RUNNING studio — the same cached dataset Booking books against and
 * the top-bar sign-in lists (shared/auth/studio.ts). This product's
 * default records are built FROM it (see live-studio.ts), so
 * re-engagement reads the same trail the rest of the studio writes.
 * A standalone port re-points these two lines. */
export { sharedStudio } from "../../shared/auth/studio.js";

/* WHO IS SIGNED IN, read but never obeyed as a gate. The audience law is
 * explicit that a surface may ADAPT to the signed-in actor and may never
 * hide or block a route — the browser session is convenience, not access
 * control, and pretending otherwise would be a lie about what protects this
 * data. This page uses it for one thing: to say plainly, to a member who
 * has landed on a staff tool, that this is the staff view and where their
 * own pages are. A standalone port re-points this line or drops it. */
export { readPulseSession, onSessionChange } from "../../shared/auth/session.js";
export type { PulseSession } from "../../shared/auth/session.js";
export type { SyntheticDataset } from "../../shared/synthetic/contracts.js";

/* The shared synthetic studio engine (team-owned, contract PROPOSED). Used
 * by this product's proof suite to walk a generated studio's attendance
 * export through the CSV door and reconcile the flags against the engine's
 * INDEPENDENT truth metadata. Products may depend on shared code; shared
 * code never depends on a product. */
export { generateStudio } from "../../shared/synthetic/generate.js";
export { attendanceCsv } from "../../shared/synthetic/csv-export.js";
/* One CSV cell-writer for the repo, so the formula-injection defusal is
 * implemented and tested once rather than repeated wherever a file is
 * written. A standalone port re-points this line. */
export { csvField } from "../../shared/synthetic/csv-export.js";
export { DEFAULT_CONFIG as SYNTHETIC_DEFAULT_CONFIG } from "../../shared/synthetic/config.js";
export type {
  Attendance,
  AttendanceStatus,
  ClassSession,
  FixtureSet,
  Instructor,
  Member,
  Membership,
  MembershipStatus,
  Reservation,
  ReservationStatus,
  StudioPolicy,
} from "../../shared/contract.js";

/* Sentence-level counting, shared so Product D and the synthetic page
 * cannot drift apart on "1 class" versus "1 classes". */
export { counted } from "../../shared/text.js";
