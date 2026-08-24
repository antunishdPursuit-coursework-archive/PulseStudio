/* Pulse Studio — Product B, the staff dashboard's DOM wiring. Manny's lane.

   WHY THIS IS TYPESCRIPT NOW. It shipped for months as hand-written
   JavaScript with no .ts beside it. tsconfig.json includes TypeScript
   sources under app only, so `tsc` never opened it: the dashboard ran 72
   lines that no gate
   type-checked, and docs/sources-baseline.json said so in as many words.
   The arithmetic was already lifted into dashboard.ts precisely so a gate
   could reach it; this file is the other half finally following.

   NOTHING ABOUT THE BEHAVIOUR CHANGED. Every expression below is the one
   that was already running. What was added is types, and one helper: el()
   replaces the bare document.querySelector calls that TypeScript correctly
   refuses to trust. It throws by name instead of failing later with
   "Cannot read properties of null", which is the same failure said sooner
   and in a sentence somebody can act on. */
import type { DashboardSession, RosterMember } from './dashboard.js';

/** A session as this page assembles it: the arithmetic half that
    dashboard.ts checks, plus the fields the page needs to draw a card. */
interface ScheduleSession extends DashboardSession {
  id: string;
  type: string;
  level: string;
  startsAt: string;
  time: string;
  room: string;
  instructor: string;
  status?: string;
}

/** A reservation Product A wrote into this browser at runtime. Every field
    is validated by reservationProblem() before it is believed. */
interface RuntimeReservation {
  reservation_id: string;
  member_id: string;
  session_id: string;
  reserved_at: string;
  reservation_status: string;
  canceled_at: string | null;
}

/* The page owns these elements; a missing one is a broken page, not a
   condition to handle. Say which one, and stop. */
function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`staff-dashboard: the page is missing ${selector}`);
  }
  return found;
}

// The arithmetic lives in dashboard.ts so a gate type-checks it and tests.ts can
// pin it; this file keeps only the DOM wiring. See dashboard.ts for why.
import { bookingDataLine, confirmedCount, emptyScheduleText, formatSessionTime, needsAttention, nextActionText, publishedSessionProblem, RESERVATION_STATUSES, reservationProblem, roomDemand, scheduleMatches, spotsLeftText, status } from './dashboard.js';
import { counted } from '../../shared/text.js';
import { escapeHtml } from '../../shared/html.js';
import { mountStaffDoor } from '../../shared/auth/staff-gate.js';
import { sharedStudioWithFill } from '../../shared/auth/studio.js';

const RUNTIME_RESERVATIONS_KEY='pulse-reservations-a';
/* THE SAME SCHEDULE STAMP a-booking/reservations.ts reads and writes —
   read here too, never imported (shared code and other products' code may
   not depend on a product's, the same rule that already made this file
   duplicate its own capacity math instead of importing Booking's).
   Session ids are positions in a window that slides at midnight, so a
   row this log holds from yesterday can point at a DIFFERENT class today
   — measured elsewhere in this repo: every future class changed type
   under its own id one day later. A member who books today, when this
   dashboard has not been opened yet today, would otherwise show up on
   whichever class now happens to sit at that id — not the one they
   booked. */
const RUNTIME_RESERVATIONS_SCHEDULE_KEY='pulse-reservations-a-schedule';
const SCHEDULE_STORAGE_KEY='pulse-schedule-b';
/* THE SAME STUDIO EVERY OTHER PRODUCT READS, topped up so the week looks
   like a studio's week. This used to generate its own — seed
   'capacity-watch-2026', frozen at 2026-08-19, 180 days of history — and
   the cost of that was the one red hand-off on the story map: a member's
   real booking names a class id from the SHARED studio, none of which
   existed here, so every reservation arrived as "outside the current
   schedule". Measured 2026-08-20: 0 shared class ids out of 75.

   The fill target is kept because it was never the problem. Generating
   with and without it produces the same 1,900 sessions, identical in id,
   start time, class type and status; it seats members and leaves the
   schedule alone. What moved the ids was the seed, the date and the
   history length, and none of those is this product's to choose. */
const dataset=sharedStudioWithFill(0.85);
const memberById=new Map(dataset.members.map(member=>[member.id,member]));
const instructorById=new Map(dataset.instructors.map(instructor=>[instructor.id,instructor]));
const typeById=new Map(dataset.classTypes.map(type=>[type.id,type]));
const sessionIds=new Set(dataset.classSessions.map(session=>session.id));
const attendanceByBooking=new Map(dataset.attendance.filter(record=>record.bookingId).map(record=>[record.bookingId,record.status]));
const readRuntimeReservations=()=>{if(!scheduleMatches(localStorage.getItem(RUNTIME_RESERVATIONS_SCHEDULE_KEY),dataset.meta.asOfDate))return{rows:[],rejected:[]};try{const raw=localStorage.getItem(RUNTIME_RESERVATIONS_KEY);if(!raw)return{rows:[],rejected:[]};const parsed=JSON.parse(raw);if(!Array.isArray(parsed))return{rows:[],rejected:['stored value must be an array']};const rows: RuntimeReservation[]=[],rejected: string[]=[];parsed.forEach((row: unknown,index: number)=>{const problem=reservationProblem(row,memberById,sessionIds);if(problem)rejected.push(`row ${index+1}: ${problem}`);else rows.push(row as RuntimeReservation);});return{rows,rejected};}catch{return{rows:[],rejected:['stored value must be valid JSON']};}};
const latestRuntimeReservations=(rows: RuntimeReservation[]): RuntimeReservation[]=>{const latest=new Map<string, RuntimeReservation>();rows.forEach((row: RuntimeReservation)=>latest.set(`${row.session_id}\u0000${row.member_id}`,row));return[...latest.values()];};
let runtimeReservations=readRuntimeReservations();
const classTypeSelect=el<HTMLSelectElement>('#classType');classTypeSelect.innerHTML=[...dataset.classTypes].sort((a,b)=>a.name.localeCompare(b.name)||a.level.localeCompare(b.level)).map(classType=>`<option value="${classType.id}">${escapeHtml(classType.name)} · ${escapeHtml(classType.level)}</option>`).join('');
const monthFormatter=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'});
const rangeStartDate=new Date(`${dataset.meta.asOfDate}T00:00:00Z`);
const dateForWeek=(weekIndex: number,dayOffset = 0): Date=>{const date=new Date(rangeStartDate);date.setUTCDate(date.getUTCDate()+weekIndex*7+dayOffset);return date;};
const isoDate=(date: Date): string=>date.toISOString().slice(0,10);
const weekKey=(weekIndex: number): string=>isoDate(dateForWeek(weekIndex));
const weekLabel=(weekIndex: number): string=>{const start=dateForWeek(weekIndex);const end=dateForWeek(weekIndex,6);const startMonth=monthFormatter.format(start);const endMonth=monthFormatter.format(end);return startMonth===endMonth?`${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}`:`${startMonth} ${start.getUTCDate()}–${endMonth} ${end.getUTCDate()}`;};
const weekAriaLabel=(weekIndex: number): string=>`${weekLabel(weekIndex)}, ${dateForWeek(weekIndex).getUTCFullYear()}`;
const weekIndexForDate=(date: string): number=>Math.floor((new Date(`${date}T00:00:00Z`).getTime()-rangeStartDate.getTime())/(7*24*60*60*1000));
const readPublishedSchedules=()=>{try{const raw=localStorage.getItem(SCHEDULE_STORAGE_KEY);if(!raw)return new Map<string, ScheduleSession[]>();const parsed: unknown=JSON.parse(raw);if(!Array.isArray(parsed))return new Map<string, ScheduleSession[]>();const sessionsByWeek=new Map<string, ScheduleSession[]>();parsed.forEach((raw2: unknown)=>{const session=raw2 as ScheduleSession;if(publishedSessionProblem(session))return;const index=weekIndexForDate(session.startsAt.slice(0,10));if(index<0)return;const key=weekKey(index);/* time is RECOMPUTED from startsAt, never trusted from storage: a week published before a formatSessionTime fix landed keeps the OLD string in localStorage forever otherwise, printing a wrong time next to correctly formatted generator sessions for as long as the browser remembers it. */const fixed={...session,time:formatSessionTime(session.startsAt)};sessionsByWeek.set(key,[...(sessionsByWeek.get(key)??[]),fixed]);});return new Map<string, ScheduleSession[]>([...sessionsByWeek].map(([key,sessions]: [string, ScheduleSession[]])=>[key,sessions.sort((a: ScheduleSession,b: ScheduleSession)=>a.startsAt.localeCompare(b.startsAt))]));}catch{return new Map<string, ScheduleSession[]>();}};
const savePublishedSchedules=(sessionsByWeek: Map<string, ScheduleSession[]>): boolean=>{try{localStorage.setItem(SCHEDULE_STORAGE_KEY,JSON.stringify([...sessionsByWeek.values()].flat()));return true;}catch{return false;}};
const rosterForSession=(session: { id: string }): RosterMember[]=>{const roster=new Map<string, RosterMember>();dataset.bookings.filter(booking=>booking.classSessionId===session.id).forEach(booking=>roster.set(booking.memberId,{member_id:booking.memberId,display_name:memberById.get(booking.memberId)?.displayName??booking.memberId,reservation_status:booking.status==='booked'?'reserved':'canceled',attendance_status:attendanceByBooking.get(booking.id)??'unknown'}));latestRuntimeReservations(runtimeReservations.rows).filter(row=>row.session_id===session.id).forEach(row=>roster.set(row.member_id,{member_id:row.member_id,display_name:memberById.get(row.member_id)?.displayName??row.member_id,reservation_status:row.reservation_status,attendance_status:'unknown'}));return[...roster.values()].sort((a,b)=>a.display_name.localeCompare(b.display_name));};
const buildSharedSessionsByWeek=()=>{const byWeek=new Map();dataset.classSessions.filter(session=>session.status==='scheduled'&&session.startsAt.slice(0,10)>=dataset.meta.asOfDate).forEach(session=>{const weekIndex=weekIndexForDate(session.startsAt.slice(0,10));if(weekIndex<0)return;const classType=typeById.get(session.classTypeId);const item={id:session.id,type:classType?.name??'Class',level:classType?.level??'All levels',startsAt:session.startsAt,time:formatSessionTime(session.startsAt),room:'Studio',instructor:instructorById.get(session.instructorId)?.displayName??'Staff assigned',capacity:session.capacity,roster:rosterForSession(session)};const key=weekKey(weekIndex);byWeek.set(key,[...(byWeek.get(key)??[]),item]);});return byWeek;};
let sharedSessionsByWeek=buildSharedSessionsByWeek();
let localSessionsByWeek=readPublishedSchedules();
const draftsByWeek=new Map();
let selectedWeekIndex=0;
let visibleWeekStart=0;
let localSessionId=[...localSessionsByWeek.values()].flat().reduce((largest,session)=>Math.max(largest,Number(session.id.slice(6))||0),0);
const getSessions=()=>[...(sharedSessionsByWeek.get(weekKey(selectedWeekIndex))??[]),...(localSessionsByWeek.get(weekKey(selectedWeekIndex))??[])].sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
const getDrafts=()=>draftsByWeek.get(weekKey(selectedWeekIndex))??[];
const enrolledMemberCount=(sessions: ScheduleSession[]): number=>new Set(sessions.flatMap(session=>session.roster.filter(member=>member.reservation_status==='reserved').map(member=>member.member_id))).size;
const reservationStatusCount=(sessions: ScheduleSession[],reservationStatus: string): number=>sessions.reduce((total,session)=>total+session.roster.filter(member=>member.reservation_status===reservationStatus).length,0);
const weeklyCapacity=(sessions: ScheduleSession[]): number=>sessions.reduce((total,session)=>total+session.capacity,0);
const runtimeSummaryText=()=>{const scheduledIds=new Set(dataset.classSessions.filter(session=>session.status==='scheduled'&&session.startsAt.slice(0,10)>=dataset.meta.asOfDate).map(session=>session.id));const latest=latestRuntimeReservations(runtimeReservations.rows);const shown=latest.filter(row=>scheduledIds.has(row.session_id)).length;const outside=latest.length-shown;return bookingDataLine(shown,outside,runtimeReservations.rejected);};
function renderWeekPicker(): void {el('#weekOptions').innerHTML=Array.from({length:4},(_,offset)=>{const weekIndex=visibleWeekStart+offset;const selected=weekIndex===selectedWeekIndex;return `<button class="week-option${selected?' selected':''}" type="button" data-week-index="${weekIndex}" aria-label="${weekAriaLabel(weekIndex)}"${selected?' aria-current="date"':''}>${weekLabel(weekIndex)}</button>`;}).join('');document.querySelectorAll<HTMLButtonElement>('.week-option').forEach((button: HTMLButtonElement)=>button.onclick=()=>{selectedWeekIndex=Number(button.dataset.weekIndex);render();});el<HTMLButtonElement>('#previousWeeks').disabled=visibleWeekStart===0;el<HTMLButtonElement>('#currentWeek').disabled=selectedWeekIndex===0&&visibleWeekStart===0;}
function render(): void {const sessions=getSessions();const filter=el<HTMLSelectElement>('#filter').value;const list=sessions.filter(session=>filter==='all'||filter==='full'&&status(session)==='Full'||filter==='attention'&&needsAttention(session));el('#sessions').innerHTML=list.map(session=>{const reserved=confirmedCount(session),fill=Math.round(reserved/session.capacity*100),label=status(session),className=label==='Full'?'full':label==='Filling soon'||label==='Underbooked'?'warn':'';return `<article class="session"><div><h3>${escapeHtml(session.type)}</h3><small>${escapeHtml(session.level)} · ${escapeHtml(session.time)}<br>${escapeHtml(session.instructor)} · ${escapeHtml(session.room)}</small></div><div class="fill"><strong>${reserved}/${session.capacity} reserved</strong><div class="meter"><i class="${className}" style="width:${Math.min(fill,100)}%"></i></div></div><div><strong>${spotsLeftText(session)}</strong></div><div><span class="status ${className}">${label}</span><br><button class="text-button roster" data-id="${session.id}">View roster</button></div></article>`}).join('')||`<p>${escapeHtml(emptyScheduleText(sessions.length,weekLabel(selectedWeekIndex)))}</p>`;document.querySelectorAll<HTMLButtonElement>('.roster').forEach((button: HTMLButtonElement)=>button.onclick=()=>{const found=sessions.find((session: ScheduleSession)=>session.id===button.dataset['id']);if(found!==undefined)showRoster(found);});el('#upcomingCount').textContent=String(sessions.length);el('#attentionCount').textContent=String(sessions.filter(needsAttention).length);el('#weekRangeLabel').textContent=weekLabel(selectedWeekIndex);el('#selectedWeekSummary').textContent=`${weekLabel(selectedWeekIndex)} · ${sessions.length} scheduled ${sessions.length===1?'session':'sessions'} · Published classes live in this browser.`;el('#weeklyEnrollment').textContent=`${enrolledMemberCount(sessions)} of ${dataset.members.length} members enrolled this week`;el('#weeklyReserved').textContent=`${reservationStatusCount(sessions,'reserved')} of ${weeklyCapacity(sessions)}`;el('#weeklyWaitlisted').textContent=String(reservationStatusCount(sessions,'waitlisted'));el('#weeklyCanceled').textContent=String(reservationStatusCount(sessions,'canceled'));const rooms=roomDemand(sessions);el('#fastestRoom').textContent=rooms[0]?.room??'—';el('#rooms').innerHTML=rooms.map(row=>`<div class="room"><div class="room-line"><strong>${escapeHtml(row.room)}</strong><span>${row.peakFill}% peak fill · ${counted(row.sessions,'session')}</span></div><div class="room-bar"><i style="width:${Math.min(row.peakFill,100)}%"></i></div></div>`).join('')||`<p class="room-empty">0 rooms in use: no sessions scheduled for ${weekLabel(selectedWeekIndex)}.</p>`;el('#dataNote').textContent=runtimeSummaryText();el('#actionText').textContent=nextActionText(sessions);renderWeekPicker();}
function showRoster(session: ScheduleSession): void {const reserved=confirmedCount(session);el('#sessions').innerHTML=`<button class="text-button" id="back">← Back to sessions</button><h3 id="session-roster" tabindex="-1">${escapeHtml(session.type)} · ${escapeHtml(session.time)}</h3><p>${reserved} reserved · ${spotsLeftText(session)}</p><table class="roster-table"><thead><tr><th scope="col">Member name</th><th scope="col">Reservation status</th><th scope="col">Attendance status</th></tr></thead><tbody>${session.roster.map(member=>`<tr><td>${escapeHtml(member.display_name)}</td><td>${member.reservation_status}</td><td>${member.attendance_status}</td></tr>`).join('')}</tbody></table>`;el('#session-roster').focus();el('#back').onclick=()=>{render();document.querySelector<HTMLElement>(`.roster[data-id="${session.id}"]`)?.focus();};}
function showWeeklyReservedRoster(sessions: ScheduleSession[]): void {const reservedRows=sessions.flatMap(session=>session.roster.filter(member=>member.reservation_status==='reserved').map(member=>({...member,classLabel:`${session.type} · ${session.time}`})));const result=reservedRows.length===0?`<p>0 reserved spots checked across ${sessions.length} scheduled ${sessions.length===1?'session':'sessions'} for ${weekLabel(selectedWeekIndex)}.</p>`:`<p>${reservedRows.length} reserved ${reservedRows.length===1?'spot':'spots'} across ${sessions.length} scheduled ${sessions.length===1?'session':'sessions'} for ${weekLabel(selectedWeekIndex)}.</p><table class="roster-table"><thead><tr><th scope="col">Member name</th><th scope="col">Class and date/time</th><th scope="col">Reservation status</th><th scope="col">Attendance status</th></tr></thead><tbody>${reservedRows.map(member=>`<tr><td>${escapeHtml(member.display_name)}</td><td>${escapeHtml(member.classLabel)}</td><td>${member.reservation_status}</td><td>${member.attendance_status}</td></tr>`).join('')}</tbody></table>`;el('#sessions').innerHTML=`<a class="roster-back-link" id="back" href="#sessions">← Back to sessions</a><h3 id="weekly-reserved-roster" tabindex="-1">Weekly reserved roster</h3>${result}`;el('#weekly-reserved-roster').focus();el('#back').onclick=event=>{event.preventDefault();render();el('#weeklyReservedLink').focus();};}
function renderDraft(): void {const drafts=getDrafts();el('#draftWeekLabel').textContent=`Adding classes to ${weekAriaLabel(selectedWeekIndex)}`;el('#draftCount').textContent=`${drafts.length} ${drafts.length===1?'class':'classes'}`;el('#draftRows').innerHTML=drafts.map((session: ScheduleSession)=>`<tr><td>${escapeHtml(session.type)}</td><td>${escapeHtml(session.level)}</td><td>${escapeHtml(session.time)}</td><td>${escapeHtml(session.room)}</td><td>${session.capacity}</td></tr>`).join('');el('.draft-table').hidden=drafts.length===0;el('#draftEmpty').hidden=drafts.length>0;el<HTMLButtonElement>('#confirmSchedule').disabled=drafts.length===0;const startsAt=el<HTMLInputElement>('#startsAt');startsAt.min=`${isoDate(dateForWeek(0,1))}T00:00`;startsAt.removeAttribute('max');}
const scheduleDialog=el<HTMLDialogElement>('#scheduleDialog');
el<HTMLSelectElement>('#filter').onchange=render;
el('#weeklyReservedLink').onclick=event=>{event.preventDefault();showWeeklyReservedRoster(getSessions());};
el('#publishBtn').onclick=()=>{el('#scheduleStatus').textContent='';renderDraft();scheduleDialog.showModal();};
el('#closeSchedule').onclick=()=>scheduleDialog.close();
el('#currentWeek').onclick=()=>{visibleWeekStart=0;selectedWeekIndex=0;render();};
el('#previousWeeks').onclick=()=>{if(visibleWeekStart===0)return;visibleWeekStart=Math.max(0,visibleWeekStart-4);selectedWeekIndex=visibleWeekStart;render();};
el('#nextWeeks').onclick=()=>{visibleWeekStart+=4;selectedWeekIndex=visibleWeekStart;render();};
el('#scheduleForm').onsubmit=event=>{event.preventDefault();const target=event.target as HTMLFormElement;const form=new FormData(target);const classType=typeById.get(String(form.get('classType')));const startsAt=String(form.get('startsAt'));const selectedDate=startsAt.slice(0,10);if(!classType||!startsAt||Number.isNaN(Date.parse(startsAt))||selectedDate<=dataset.meta.asOfDate){el('#scheduleStatus').textContent='Choose a class and a valid date after 08/19/2026.';return;}const targetWeekIndex=weekIndexForDate(selectedDate);if(targetWeekIndex<0){el('#scheduleStatus').textContent='Choose a class and a valid date after 08/19/2026.';return;}selectedWeekIndex=targetWeekIndex;visibleWeekStart=Math.floor(targetWeekIndex/4)*4;localSessionId+=1;const draft={id:`local-${localSessionId}`,type:classType.name,level:classType.level,startsAt,time:formatSessionTime(startsAt),room:String(form.get('room')),instructor:'Staff assigned',capacity:Number(form.get('capacity')),roster:[]};draftsByWeek.set(weekKey(targetWeekIndex),[...getDrafts(),draft]);target.reset();el('#scheduleStatus').textContent=`${draft.type} added to the ${weekLabel(targetWeekIndex)} schedule.`;render();renderDraft();};
el('#confirmSchedule').onclick=()=>{const drafts=getDrafts();if(drafts.length===0)return;const key=weekKey(selectedWeekIndex);const previous=localSessionsByWeek.get(key)??[];localSessionsByWeek.set(key,[...previous,...drafts].sort((a,b)=>a.startsAt.localeCompare(b.startsAt)));if(!savePublishedSchedules(localSessionsByWeek)){localSessionsByWeek.set(key,previous);el('#scheduleStatus').textContent='The schedule could not be saved in this browser.';return;}draftsByWeek.set(key,[]);scheduleDialog.close();render();};
let runtimeSignature=JSON.stringify(runtimeReservations);
const refreshRuntimeReservations=()=>{const next=readRuntimeReservations();const signature=JSON.stringify(next);if(signature===runtimeSignature)return;runtimeReservations=next;runtimeSignature=signature;sharedSessionsByWeek=buildSharedSessionsByWeek();render();};
window.addEventListener('storage',event=>{if(event.key===RUNTIME_RESERVATIONS_KEY)refreshRuntimeReservations();if(event.key===SCHEDULE_STORAGE_KEY){localSessionsByWeek=readPublishedSchedules();render();}});
window.addEventListener('focus',refreshRuntimeReservations);
// THE DOOR COMES FIRST. Nothing about this dashboard is drawn until the
// studio's server confirms a staff session; see shared/auth/staff-gate.ts
// for what that check is and what it is not.
mountStaffDoor(document.querySelector('main') ?? document.body).then(open => { if (open) render(); });
