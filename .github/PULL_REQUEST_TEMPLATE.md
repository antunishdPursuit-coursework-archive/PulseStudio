## Product and developer

<!-- A/Kerrian · B/Manny · C/Dennis · D/Rensley -->

## What changed

<!-- Plain words. What does a reviewer see or get that they did not before? -->

## Lane check — the things no gate can decide for you

<!-- `npm run check` runs every gate the `check` script in `package.json`
     names — read them THERE, not from a list here. This comment used to
     enumerate six of them and was still naming six long after there were
     eleven, which is the same drift the root brief warns about two levels
     up: the gates are named in package.json and counted nowhere.

     Do not re-tick by hand anything a gate decides. What is left below is
     judgement, which is why it is still a checklist — and note that the
     FIRST box is now half machine-checked: check-lanes.mjs fails a commit
     that reaches into another developer's folder, so the part still asking
     something of you is the AGREEMENT for a team-owned file, which no gate
     can see. -->

- [ ] Every changed file is inside my product folder, OR this PR changes a
      team-owned file and the team agreed first (say where/when below)
- [ ] No shared field renamed, redefined, or copied into my product
- [ ] `npm run check` passes — paste the "N checks across 3 suites" line
- [ ] I opened the pages this could affect and looked at them. A green gate
      does not open a browser.
- [ ] Backgrounds come from `var(--bg)`: built-in light and dark stay white
      and black, and a person may choose an accessible custom pair through
      the appearance control. No gradients. My features carry my colour.
- [ ] Anything I claim in the description, I watched happen

## Team agreement (only if a team-owned file changed)

<!-- Who agreed and where — otherwise delete this section -->
