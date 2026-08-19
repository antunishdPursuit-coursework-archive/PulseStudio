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
