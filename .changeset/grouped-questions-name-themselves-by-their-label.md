---
"@mj-biz-apps/forms-ng": patch
---

**The eight grouped question types tell a screen reader what they are asking.**
SingleChoice, MultiChoice, Rating, NPS, YesNo, PictureChoice, OpinionScale and Legal render a
`role="radiogroup"` / `role="group"` container whose `aria-labelledby` pointed at `inputId()` — the
id of the *control*. A native control (`<input>`, `<select>`, `<textarea>`, the Checkbox button)
carries that id on itself, so the shared `<label for>` resolves and the field is named; a group of
buttons has no element carrying it, and the shared `<label>` had a `for` but never an `id`. So all
eight references pointed at nothing and every group computed an empty accessible name: Chrome's
accessibility tree showed a bare `radiogroup:`, and on Legal an unnamed Yes/No — a consent control
whose question was inaudible. It failed WCAG 1.3.1 and 4.1.2 against the plan's AA bar.

The shared `<label>` now carries `labelId()` (`${inputId()}-label`) and the eight groups are named
by it, so grouped and native controls compute the same accessible name from the same element and
cannot drift apart. Eight controls that had no name now read as `radiogroup "Rating"`,
`group "Multi choice"`, `radiogroup "Legal consent"`; the seventeen that already had one are
untouched. No CSS, no DOM restructuring, and no change to any rendered geometry.

`aria-describedby` was **not** affected, despite what issue #117 says: `describedBy()` joins
`helpId()` / `errorId()` / `statusId()`, each bound as `[id]` on its own element, and all of them
resolved before this change. Help text and validation errors already reached assistive tech.

A wiring spec (`aria-idrefs.wiring.spec.ts`) now walks every branch of the question-type switch and
requires each ARIA idref to resolve to an id bound **in that branch or the shared region**. The
branch scoping is the point: `inputId()` was bound as `[id]` elsewhere in the template throughout
the bug, so a plain "is this id bound anywhere?" check was true the whole time the groups were
unnamed.

Ranking and Matrix still have no accessible name — the same shape, deliberately out of scope here,
and the spec pins the current set so fixing them has to be an explicit decision rather than a
silent drift.
