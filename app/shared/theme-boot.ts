/* Pulse Studio — theme boot. TEAM-OWNED.
   Every page loads this once so the member's black-or-white choice follows
   them across all four products. If the page has a #theme-toggle button
   (the front door does), this also wires it.

   The shared sign-in control rides the same ride (added 2026-08-20): any
   page that loads theme-boot and has a recognizable header (.topnav or
   .page-head) grows the session chip — which is how sign-in reached every
   product without a single edit inside a product folder. A page that should
   stay chip-free (a proof page) opts out with <body data-no-session>. */

import { mountSessionControl } from "./components/topbar.js";

const root = document.documentElement;
const saved = localStorage.getItem("pulse-theme");
if (saved === "dark" || saved === "light") {
  root.dataset.theme = saved;
}

const toggle = document.getElementById("theme-toggle");
if (toggle) {
  toggle.addEventListener("click", () => {
    const dark =
      root.dataset.theme === "dark" ||
      (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "light" : "dark";
    localStorage.setItem("pulse-theme", root.dataset.theme);
  });
}

const sessionHost = document.querySelector(".topnav, .page-head");
if (sessionHost !== null && !document.body.hasAttribute("data-no-session")) {
  mountSessionControl(sessionHost);
}

export {};
