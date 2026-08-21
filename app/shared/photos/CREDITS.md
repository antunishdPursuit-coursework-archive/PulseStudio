# app/shared/photos — where these pictures came from

**TEAM-OWNED.** Four WebP files, 592 KB total, served from this repo like
everything else — no image CDN, no third party watching who looks at the
studio's website.

| File | What it shows | Photographer | Source |
| --- | --- | --- | --- |
| `studio-room.webp` | A dark studio floor, equipment in low light | [@getslower](https://unsplash.com/@getslower) | [Unsplash](https://unsplash.com/photos/3WSidr2Yqkc) |
| `cycling-row.webp` | A row of stationary bikes | [@livesbro](https://unsplash.com/@livesbro) | [Unsplash](https://unsplash.com/s/photos/cycling-studio) |
| `machines-row.webp` | A row of machines down a studio floor | [@dropfastcollective](https://unsplash.com/@dropfastcollective) | [Unsplash](https://unsplash.com/photos/cLyzq6OMZoM) |
| `weights-detail.webp` | Dumbbells racked, close | [@jgrant1](https://unsplash.com/@jgrant1) | [Unsplash](https://unsplash.com/s/photos/dumbbells) |

## The licence, and the rule it sets

All four are under the **Unsplash License**: free to use commercially, no
permission needed, no attribution required. We credit anyway — the
photographers gave these away and the cost of saying so is one table.

**The rule for adding a photo:** free `images.unsplash.com` files only.
Anything served from `plus.unsplash.com` is **Unsplash+**, a paid tier that
this project has no licence for — it looks identical in a search result and
is not ours to use. Check the host before you download, and add the new
file to the table above in the same commit.

## What these pictures are, and what they are not

They are **atmosphere**: rooms, equipment, light. Deliberately no faces and
no posed members, for two reasons. A photograph of a real person on a
studio's page reads as *"this is one of our members"* — which would be
untrue, and this repo's law is that every person in it is fictional. And
rooms age better than haircuts.

## The grade

Every photo is rendered through one treatment in `theme.css`
(`.studio-photo`) — a slight desaturation and a lift in contrast — so four
pictures taken by four strangers in four rooms read as one studio. Change
the grade there, once, and every picture on the site follows.
