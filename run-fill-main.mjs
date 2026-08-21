const A = "/private/tmp/claude-502/-Users-Rensley-Desktop-claude-fleet/c29fe360-1f82-4c72-998a-d0c880479f0e/scratchpad/d-brand-fix/main-tree/app/";
const store = new Map();
globalThis.localStorage = { getItem:(k)=>store.get(k)??null, setItem:(k,v)=>store.set(k,String(v)), removeItem:(k)=>store.delete(k) };
class El { constructor(){this.children=[];this.dataset={};this.hidden=false;this.textContent="";this.innerHTML="";}
  querySelectorAll(){return [];} querySelector(){return null;} addEventListener(){} append(){} appendChild(){} scrollIntoView(){} replaceChildren(){} }
const stub = new El();
globalThis.document = { querySelector: ()=>stub, getElementById: ()=>null, createElement: ()=>new El(), head:new El(), body:new El() };
globalThis.location = { search:"", href:"http://x/" };
globalThis.history = { replaceState(){} };
globalThis.addEventListener=()=>{}; globalThis.window=globalThis;
await import(A+"products/a-booking/main.js");
const rows = JSON.parse(store.get("pulse-reservations-a")||"[]");
console.log("runtime reservations written on first visit:", rows.length);
// now D
const { sharedStudio } = await import(A+"shared/auth/studio.js");
const { fixtureSetFrom, readRuntimeReservations } = await import(A+"products/d-reengagement/live-studio.js");
const { findQuietMembers, todayDayNumber, upcomingReservedMemberIds } = await import(A+"products/d-reengagement/logic.js");
const { proposedRules } = await import(A+"products/d-reengagement/config.js");
const data = fixtureSetFrom(sharedStudio(), readRuntimeReservations());
const today = todayDayNumber(data.timezone);
const res = findQuietMembers(data, today, proposedRules);
const coming = upcomingReservedMemberIds(data, today);
const back = res.flagged.filter(f=>coming.has(f.member.member_id));
console.log("flagged:", res.flagged.length, "left alone (already booked back in):", back.length, "drafts:", res.flagged.length-back.length);
console.log(back.map(f=>f.member.display_name));
