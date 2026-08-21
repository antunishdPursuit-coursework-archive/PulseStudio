# app/shared/fonts — the studio's two faces, hosted here on purpose

**TEAM-OWNED.** Two font files, 48 KB total, latin subset only.

| File | Face | Used for |
| --- | --- | --- |
| `anton-400.woff2` | Anton | `--font-display`: headlines, page names, buttons, chips, labels |
| `epilogue-variable.woff2` | Epilogue (variable, 400–700 in one file) | `--font-body`: everything a person actually reads |

**Anton ships exactly one weight.** Asking CSS for 700 or 800 makes the
browser *synthesise* a bold — smeared and heavier than the designer drew.
Every rule that uses the display face asks for `font-weight: 400`, which is
already the heavy one. If a heading ever looks blurry or too fat, something
asked for a weight Anton does not have.

## The decision, so it is not re-argued

**Anton is the display face on purpose — ratified by the owner on
2026-08-21.** It is the standard face of this category: walk through the
sites of independent gyms and boutique studios and you meet it constantly,
which is exactly the argument for it. A member landing here should know
what kind of business this is before reading a word, and category fluency
beats novelty for a studio trying to fill classes.

The trade-off was weighed and accepted: Anton is *common*, and the luxury
end of the category (Equinox and similar) goes the other way — a quieter
custom sans at mid weight, letting photography carry the page. If this
studio ever repositions that way, the change is one token
(`--font-display` in `theme.css`) plus a font file, and the argument for it
belongs in this section rather than in a silent commit.

Anything that reads as "let us modernise the font" without a positioning
reason is churn. This paragraph exists to stop it.

## Why the files live in this repo instead of a font CDN

A `<link>` to a font service makes every visitor's browser call a third
party on every page load — handing over their IP and the page they are on.
This site tells members *"your records never leave your browser."* Hosting
the faces ourselves keeps that sentence true, keeps the studio working with
no outside service in the path, and costs 48 KB once.

## Licensing — read before swapping either face

Both are under the **SIL Open Font License 1.1**, which permits
self-hosting and redistribution and requires the copyright notice and
license to travel with the fonts — which is why `OFL-Anton.txt` and
`OFL-Epilogue.txt` sit beside them. **Do not delete those files**, and if
you replace a face, replace its license file in the same commit. A font
swapped in without checking its license is the one legal risk a static site
like this actually carries.

## Changing the studio's face

`@font-face` lives in `app/shared/theme.css` beside the type tokens, and
every fallback stack still names system faces — so a page renders in a
close relative, never a serif, if a file fails to load. `font-display:
swap` means text is painted immediately and upgrades when the file lands;
it is never invisible.

An earlier pairing (Barlow Condensed + Inter) was shipped and then replaced
by this one. Nothing of it remains: unused font files are weight for
nothing, so they were deleted with their licenses rather than left behind
"just in case."
