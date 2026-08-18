/* Pulse Studio — theme boot. TEAM-OWNED.
   Every page loads this once so the member's black-or-white choice follows
   them across all four products. If the page has a #theme-toggle button
   (the front door does), this also wires it. */

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

export {};
