const A = "/Users/Rensley/Desktop/pulseStudio/PulseStudio/app/";
globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const { sharedStudio } = await import(A+"shared/auth/studio.js");
const ds = sharedStudio();
const sched = ds.classSessions.filter(s=>s.status==="scheduled").sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
console.log("scheduled count:", sched.length);
console.log("first 5 by startsAt:", sched.slice(0,5).map(s=>s.startsAt));
console.log("statuses present:", [...new Set(ds.classSessions.map(s=>s.status))]);
console.log("asOfDate:", ds.meta.asOfDate);
