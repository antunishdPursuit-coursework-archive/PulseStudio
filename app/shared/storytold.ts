/* Storytold — the scroll driver. TEAM-OWNED (shared ground).
 *
 * The whole job: as the reader scrolls the five beats, keep ONE attribute
 * (data-beat on #scrolly) naming the beat nearest the middle of the
 * screen. The map's reactions are entirely CSS keyed on that attribute —
 * this file never touches a color, a class on the SVG, or any style.
 *
 * Progressive by construction: if this script never runs, .live is never
 * added, the beats stay a compact list, data-beat stays "5", and the page
 * is exactly the page we had before scrollytelling existed. Same on small
 * screens, where the layout media query never engages the sticky column.
 */

const scrolly = document.querySelector<HTMLElement>("#scrolly");
const beats = Array.from(
  document.querySelectorAll<HTMLLIElement>(".beats > li"),
);

if (scrolly !== null && beats.length > 0 && "IntersectionObserver" in window) {
  scrolly.classList.add("live");

  // The story OPENS on beat one — without this, the map wears the HTML
  // default (the full beat-5 view) until the first scroll intersection.
  scrolly.dataset["beat"] = "1";
  beats[0]?.classList.add("active");

  // A band across the middle of the viewport: the beat inside it is the
  // active one. Top and bottom margins shrink the observation window so
  // exactly one beat tends to intersect at a time.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = beats.indexOf(entry.target as HTMLLIElement);
        if (index === -1) continue;
        scrolly.dataset["beat"] = String(index + 1);
        for (const [i, li] of beats.entries()) {
          li.classList.toggle("active", i === index);
        }
      }
    },
    { rootMargin: "-38% 0px -38% 0px", threshold: 0 },
  );
  for (const li of beats) observer.observe(li);
}
