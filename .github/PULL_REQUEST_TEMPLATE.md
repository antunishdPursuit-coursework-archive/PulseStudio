## Product and developer

<!-- A/Kerrian · B/Manny · C/Dennis · D/Rensley -->

## What changed

<!-- Plain words. What does a reviewer see or get that they did not before? -->

## Lane check — the things no gate can decide for you

<!-- `npm run check` already fails on: a banned word in use, an assistant
     credited, a product restyling something the shared theme owns, a NEW
     colour pairing below WCAG AA, a broken or aged-out shared record, and
     any of the three suites. Do not re-tick those by hand; run the gate.
     What is left below is judgement, which is why it is still a checklist. -->

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
