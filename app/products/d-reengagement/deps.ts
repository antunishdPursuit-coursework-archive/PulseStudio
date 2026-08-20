/* Product D — the ONE file that touches anything outside this folder.
 *
 * THE PORTABILITY SEAM: every other .ts file in this product imports its
 * shared types and its record loader from HERE, never from ../../shared
 * directly. To run this product inside a different host — another studio
 * clone, a booking platform, a standalone deploy — edit THIS file alone:
 * point the type re-exports at your host's contract and loadFixtures() at
 * whatever produces records in that shape. The engine (logic.ts), the brand
 * seam (config.ts), the UI (main.ts), and all 27 unit checks carry over
 * without a single edit.
 *
 * The only tethers deps.ts does not carry are presentation-level, by
 * design: the shared theme.css tokens and theme-boot.js script tags in the
 * two HTML files — swap those for your host's stylesheet when porting.
 */

export { loadFixtures } from "../../shared/data.js";

/* The studio's identity — the shared clone seam. This product's brand
 * (config.ts) sources its studioName from here, so renaming the studio is
 * ONE shared file (app/shared/brand.ts); a standalone port re-points this
 * line at its own name. */
export { STUDIO_NAME } from "../../shared/brand.js";

/* The shared synthetic studio engine (team-owned, contract PROPOSED). Used
 * by this product's proof suite to walk a generated studio's attendance
 * export through the CSV door and reconcile the flags against the engine's
 * INDEPENDENT truth metadata. Products may depend on shared code; shared
 * code never depends on a product. */
export { generateStudio } from "../../shared/synthetic/generate.js";
export { attendanceCsv } from "../../shared/synthetic/csv-export.js";
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
