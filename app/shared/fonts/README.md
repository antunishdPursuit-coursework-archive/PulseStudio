# app/shared/fonts — the studio's two faces, hosted here on purpose

**TEAM-OWNED.** Three font files, 82 KB total, latin subset only. (A 600
weight was downloaded first and deleted: nothing on any page used it, and
a file no page loads is weight for nothing. Adding a weight back is one
download plus one `@font-face`.)

| File | Face | Used for |
| --- | --- | --- |
| `barlow-condensed-700/800.woff2` | Barlow Condensed | `--font-display`: headlines, page names, buttons, chips, labels |
| `inter-variable.woff2` | Inter (variable, 400–700 in one file) | `--font-body`: everything a person actually reads |

## Why the files live in this repo instead of a font CDN

A `<link>` to a font service would make every visitor's browser call a
third party on every page load — handing over their IP and the page they
are on. This site tells members *"your records never leave your browser."*
Hosting the two faces ourselves keeps that sentence true, keeps the studio
working with no third party in the path, and costs 96 KB once.

It also keeps the stack honest: no build step, no package, no account. The
files are served by the same GitHub Pages deploy as everything else.

## Licensing — read before swapping either face

Both are under the **SIL Open Font License 1.1**, which permits
self-hosting and redistribution. The license requires the copyright notice
and license text to travel with the fonts, which is why
`OFL-Barlow-Condensed.txt` and `OFL-Inter.txt` sit beside them. **Do not
delete those files**, and if you ever replace a face, replace its license
file in the same commit. A font swapped in without checking its license is
the one legal risk a static site like this can actually carry.

## Changing the studio's face

`@font-face` lives in `app/shared/theme.css` next to the type tokens.
Every fallback stack still names the system faces, so a page renders in a
close relative — never in a serif — if a file ever fails to load.

Subsets came from the Google Fonts latin subset (`unicode-range`
U+0000-00FF plus common punctuation). A studio needing other alphabets
adds the matching subset file and a second `@font-face` with that range;
nothing else changes.
