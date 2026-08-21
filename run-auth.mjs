const ROOT = "/Users/Rensley/Desktop/pulseStudio/PulseStudio/app/shared/auth/";
const store = new Map();
globalThis.localStorage = { getItem:(k)=>store.get(k)??null, setItem:(k,v)=>store.set(k,String(v)), removeItem:(k)=>store.delete(k) };
const listeners = new Map();
globalThis.addEventListener = (t,f)=>{ if(!listeners.has(t)) listeners.set(t,[]); listeners.get(t).push(f); };
globalThis.removeEventListener = (t,f)=>{ const a=listeners.get(t)||[]; const i=a.indexOf(f); if(i>=0)a.splice(i,1); };
globalThis.dispatchEvent = (e)=>{ (listeners.get(e.type)??[]).slice().forEach(f=>f(e)); return true; };
globalThis.window = globalThis;
class HTMLElement { constructor(){ this.children=[]; this.textContent=""; this.className=""; } appendChild(c){this.children.push(c);} append(c){this.children.push(c);} }
globalThis.HTMLElement = HTMLElement;
const summary = new HTMLElement(); const list = new HTMLElement();
globalThis.document = { querySelector: (s) => s==="#summary"?summary:s==="#results"?list:null, createElement: () => new HTMLElement() };
await import(ROOT + "tests.js");
console.log("SUMMARY:", summary.textContent);
for (const c of list.children) if (c.className==="fail") console.log(c.textContent);
