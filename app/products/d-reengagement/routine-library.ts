/* Pulse Studio — Product D — the routine library. RENSLEY'S LANE.
 *
 * NOTHING IN HERE IS APPROVED, AND THAT IS THE POINT.
 *
 * Every entry ships as `status: "draft"`, so `approvedRoutines()` returns an
 * empty list and the routine panel says "0 approved routines. Nothing to
 * include yet." That empty state is not a gap waiting to be filled in with
 * something plausible — it is the honest reading of where this feature is.
 * Approval means a qualified person read the words and put their name to
 * them. Nobody has. Until somebody does, no member sees any of this.
 *
 * WHY WRITE IT AT ALL, THEN. Because the shape has to be real for the panel,
 * the public routine page and the checks to be exercised against something,
 * and because it shows an author what a routine should contain. It is
 * scaffolding for a reviewer, not content for a member.
 *
 * `approvedBy` and `approvedAt` ON A DRAFT CARRY NO ASSERTION. The contract
 * requires both fields, and a draft has no approver — so `approvedBy` says
 * so in words, and a check below refuses any entry here that names a person
 * while still marked draft. The day somebody genuinely approves one, they
 * change three things together: the words if they need changing, their own
 * name, and the status. Changing the status alone would be the failure this
 * file is written to make obvious.
 *
 * TO APPROVE A ROUTINE: read every step and the safety notice; satisfy
 * yourself the movements are reasonable as GENERAL fitness information for
 * an unknown adult; set `approvedBy` to your name and `approvedAt` to the
 * date you read it; set `status` to "approved". If you later edit any step,
 * instruction, difficulty or the safety notice, set it back to "draft" —
 * approval covers the text that was read, not the file it lived in.
 */

import type { HomeRoutine } from "./routines.js";

/** The words that stand in for an approver while nothing is approved. A
 *  check pins this exact string, so it cannot quietly become a name. */
export const NOT_REVIEWED = "Not reviewed — draft content";

/** The one safety notice every routine carries. General information, and it
 *  says so; it does not claim the routine suits the person reading it. */
export const SAFETY_NOTICE =
  "General fitness information from the studio. Not individualised medical advice, " +
  "and not prepared for any one person's circumstances.";

export const ROUTINE_LIBRARY: readonly HomeRoutine[] = [
  {
    id: "routine-morning-mobility",
    title: "Morning mobility",
    summary: "A short sequence to move every joint before the day starts.",
    purpose: "Keep a gentle habit going on days you are not at the studio.",
    durationMinutes: 10,
    difficulty: "gentle",
    equipment: [],
    interestKeys: ["mobility", "yoga", "general"],
    steps: [
      {
        id: "step-neck",
        title: "Neck turns",
        instruction: "Sit or stand tall. Turn your head slowly to look over one shoulder, then the other.",
        repetitions: 8,
        easierOption: "Turn a shorter distance and move more slowly.",
      },
      {
        id: "step-shoulders",
        title: "Shoulder rolls",
        instruction: "Roll both shoulders backwards in a slow, full circle.",
        repetitions: 10,
        restSeconds: 15,
      },
      {
        id: "step-cat-cow",
        title: "Rounding and arching",
        instruction: "On hands and knees, round your back upwards, then let it settle downwards. Move with your breath.",
        durationSeconds: 60,
        easierOption: "Do the same movement sitting on a chair.",
        caution: "Keep the movement small if your wrists or knees complain.",
      },
      {
        id: "step-hips",
        title: "Standing hip circles",
        instruction: "Hands on hips, draw a slow circle with your hips one way, then the other.",
        durationSeconds: 45,
      },
    ],
    approvedBy: NOT_REVIEWED,
    approvedAt: "2026-08-22",
    safetyNotice: SAFETY_NOTICE,
    status: "draft",
  },
  {
    id: "routine-steady-strength",
    title: "Steady strength at home",
    summary: "Bodyweight movements you can do in a small space.",
    purpose: "Hold on to strength work between studio sessions.",
    durationMinutes: 20,
    difficulty: "standard",
    equipment: ["A sturdy chair"],
    interestKeys: ["strength", "general"],
    steps: [
      {
        id: "step-sit-stand",
        title: "Sit to stand",
        instruction: "From a chair, stand up without using your hands, then sit back down under control.",
        repetitions: 10,
        restSeconds: 45,
        easierOption: "Use your hands on your thighs to help you up.",
      },
      {
        id: "step-wall-press",
        title: "Wall press",
        instruction: "Hands on a wall at shoulder height. Bend your elbows to bring your chest towards the wall, then press away.",
        repetitions: 12,
        restSeconds: 45,
        easierOption: "Stand closer to the wall.",
      },
      {
        id: "step-hinge",
        title: "Hip hinge",
        instruction: "Feet hip width apart. Push your hips backwards, letting your chest tip forwards, then stand tall again.",
        repetitions: 10,
        restSeconds: 45,
        caution: "Stop if you feel this in your lower back rather than the back of your legs.",
      },
      {
        id: "step-march",
        title: "Standing march",
        instruction: "March on the spot, lifting each knee to hip height.",
        durationSeconds: 60,
      },
    ],
    approvedBy: NOT_REVIEWED,
    approvedAt: "2026-08-22",
    safetyNotice: SAFETY_NOTICE,
    status: "draft",
  },
  {
    id: "routine-wind-down",
    title: "Evening wind-down",
    summary: "Slow stretches and breathing to finish the day.",
    purpose: "A calm option on days a class was missed.",
    durationMinutes: 12,
    difficulty: "gentle",
    equipment: ["A cushion or folded towel"],
    interestKeys: ["mobility", "yoga", "pilates"],
    steps: [
      {
        id: "step-breath",
        title: "Settle the breath",
        instruction: "Sit comfortably. Breathe in through your nose for a count of four, out for a count of six.",
        durationSeconds: 90,
      },
      {
        id: "step-fold",
        title: "Seated forward fold",
        instruction: "Sit with legs long. Tip forwards from the hips only as far as is comfortable, and rest there.",
        durationSeconds: 60,
        easierOption: "Sit on a cushion and bend your knees.",
        caution: "This should feel like a stretch, never a pinch.",
      },
      {
        id: "step-twist",
        title: "Gentle seated twist",
        instruction: "Sitting tall, turn your upper body to one side and rest a hand behind you. Change sides.",
        durationSeconds: 60,
      },
      {
        id: "step-legs-up",
        title: "Legs resting high",
        instruction: "Lie down and rest your lower legs on a chair seat, knees bent. Let your back settle.",
        durationSeconds: 120,
        easierOption: "Lie with knees bent and feet flat on the floor instead.",
      },
    ],
    approvedBy: NOT_REVIEWED,
    approvedAt: "2026-08-22",
    safetyNotice: SAFETY_NOTICE,
    status: "draft",
  },
];
