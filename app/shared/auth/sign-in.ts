/* Pulse Studio — the sign-in FLOW. TEAM-OWNED.
 *
 * BEST-PRACTICE SPLIT, stated so it stays: this folder (auth/) owns the
 * DECISIONS — who may sign in, what a session is, what gets written.
 * components/ owns the PIXELS — buttons, dialogs, chips. The topbar used
 * to hold both; the flow now lives here, so a different surface (a future
 * sign-up page, a kiosk view, a host app) can offer the same sign-in
 * without borrowing a dialog.
 *
 * Test mode, as everywhere: no password, fictional people, stated in the
 * open. The hosted version replaces HOW these functions verify (Postgres,
 * docs/hosted-schema.sql), not what they mean.
 */

import type { SyntheticMember } from "../synthetic/contracts.js";
import { sharedStudioMembers } from "./studio.js";
import { FRONT_DESK, writePulseSession, type PulseSession } from "./session.js";

/** Everyone who may sign in today: the running studio's members, plus the
 *  one staff actor. The list IS the policy — a surface renders it, it does
 *  not invent its own. */
export function signInChoices(): { members: SyntheticMember[]; staff: PulseSession } {
  return { members: sharedStudioMembers(), staff: FRONT_DESK };
}

/** Sign in as a member of the running studio. The session stores the
 *  immutable member id (the identity law); the display name rides along
 *  as presentation. */
export function signInAsMember(member: SyntheticMember): void {
  writePulseSession({
    version: 1,
    actor_type: "member",
    member_id: member.id,
    display_name: member.displayName,
  });
}

/** Sign in as the one recognized staff actor. */
export function signInAsFrontDesk(): void {
  writePulseSession(FRONT_DESK);
}
