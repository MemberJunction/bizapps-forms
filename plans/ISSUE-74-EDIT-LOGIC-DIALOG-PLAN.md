# Issue #74 — the two Edit-logic-dialog controls that were never built

Closes [#74](https://github.com/MemberJunction/bizapps-forms/issues/74). Branch:
`enhancement/rules-and-branching`, cut from `next` at `1d8f27a` (the merge of #72), tracking
`origin/enhancement/rules-and-branching` — **not** `origin/next`, per the repo's branching rule.

## Status snapshot

| Phase | State | Commit |
|---|---|---|
| **1. One default ending, enforced** | **DONE** | `45d586d` |
| **2. The catch-all, stated in the dialog** | **DONE** (uncommitted) | working tree |
| 3. Delete all rules | not started | — |
| 4. Close out | not started | — |

Also on this branch, unrelated to #74 and safe to ignore while working on it: `51965de`
(developer-local paths out of tracked files) and `4bdf894` (CLAUDE.md's MJ pin was two majors
stale — the repo is on `6.1.0-edge`, not 5.51.0).

Nothing is merged. No PR is open.

---

## What #74 actually asks for

`plans/QUESTION_LEVEL_LOGIC_PLAN.md` §6 (Phase 4) specified two controls for the **Edit logic**
dialog that were never reached. A third — "See all rules" → the Rules tab — is obsolete: that tab
was deleted in `d4b31c0` and every rule is now a badge on its own item.

1. **"All other cases go to"** — reads and writes the default ending screen's `isDefault`. The
   behaviour exists and works (`resolveEndingScreen`); what is missing is the author's view of it.
   The plan is explicit that Phase 4 *surfaces* it, it does not invent it.
   **→ Shipped as a read-only line, not a picker.** See Phase 2 and *Phase 2's design history*
   below before touching this. The control was built and removed on purpose.
2. **"Delete all rules"**, behind a confirm. Minor. Today, clearing an item means clicking the
   per-rule bin once per rule.

### The finding that reordered the work

`FormScreen.IsDefault` shipped as an independent switch per ending screen, under a label promising
*"every form needs exactly one"* that **nothing enforced** — not the application (`toggleDefault`
was a free `!` flip) and not the database (the same migration adds `UQ_FormScreen_OneWelcomePerForm`
for Welcome screens and no analogue for `IsDefault`). `resolveEndingScreen` tolerated it by taking
the first in display order.

A "All other cases go to" **picker is single-choice by shape**. Building one on a field that
permits any number produces a control that is correct when used and silently contradicted from the
Endings surface afterwards. Hence Phase 1 before Phase 2, and hence Phase 1 is a behaviour change
with a migration rather than UI work.

---

## Phase 1 — one default ending, enforced ✅ `45d586d`

9 files, +571/−28. Shipped exactly this and nothing more:

**`packages/Angular/src/lib/builder/default-ending.ts`** (new, pure, Angular-free)
- `defaultEndingId(screens)` — the ending marked as the catch-all, or `null`. Sorts by
  `DisplayOrder` and breaks a tie the way `resolveEndingScreen` breaks it, so builder and runtime
  cannot name different screens. Excludes Welcome screens and screened-out endings, because
  `resolveEndingScreen` excludes the latter from resolution entirely.
- `defaultEndingChanges(screens, nextId)` → `{ clear: T[]; set: T | null }` — the two writes that
  move the default, **in the order they must happen**. Throws on an id naming no eligible ending
  rather than clearing the default and setting nothing (which would leave the form with none).
- `vacantDefaultEnding(screens)` — who should be promoted when the form has no default; `null`
  when one exists or nothing is eligible.
- Structural input type (`DefaultEndingCandidate`), so specs need no `BaseEntity`. The generated
  screen entity satisfies it by shape.

**`builder-state.service.ts`**
- `setDefaultEnding(tree, screenId)` — clears the old default, **awaits**, then sets the new one.
  Deliberately not `saveDebounced`: that keys a timer per entity object with no ordering between
  them, and with the unique index the wrong order is a refused save the author experiences as a
  switch flipping itself back, reported against the wrong screen.
- `deleteScreen(tree, screen)` — signature changed. It now removes the screen from the tree *and*
  promotes a survivor when the delete leaves the form without a default. The old signature handed
  the caller a boolean and let it splice the tree itself, so the repair had no owner and nobody
  did it.
- `addScreen` — a new ending is flagged when `defaultEndingId(...) === null`, i.e. when the form
  **has** no default. It used to ask whether the form had **any** endings, which differs exactly
  where it matters: a form whose only ending is screened out.

**`screen-editor.component.ts`**
- The Default-ending switch only turns **on**; it is disabled when already the default, because a
  form with no catch-all is not a state worth offering.
- The row is hidden entirely for a screened-out ending, and the Screened-out switch is disabled
  while the screen is the default — the exclusion holds in both directions.
- New `@Output makeDefaultRequested`. A *request*, not a change: the host must also clear the
  ending that holds it today, and this editor only ever has one screen.

**`form-builder.component.{ts,html}`** — routes `makeDefaultRequested` → `setDefaultEnding`,
awaited and not debounced; drops its own tree splice from the delete path.

**`migrations/V202608271200__v0.12.x__One_Default_Ending_Per_Form.sql`** — repairs, then enforces:
1. too many → keep the lowest `DisplayOrder`, which is the screen the runtime already resolved to,
   so no respondent's ending moves;
2. flagged but ineligible (Welcome, or screened out) → clear;
3. too few → promote the first eligible ending;
4. `UQ_FormScreen_OneDefaultEndingPerForm ON FormScreen(FormID) WHERE IsDefault = 1`.

**`.changeset/one-default-ending.md`** — `minor`. Required: `.github/workflows/changes.yml`
rejects a PR to `next` that adds a migration without a `minor` or `major` changeset.

### Verified, not assumed

- 23 new tests (12 pure in `default-ending.spec.ts`, 11 structural in
  `default-ending.wiring.spec.ts`). `forms-ng` 1187 → 1210; suite total 2235.
- `ngc` with `strictTemplates` clean; `lint:ui`, `lint:migrations`, `lint:distribution`,
  `lint:generated` all pass.
- Migration applied (`1 applied`). Index confirmed present, unique **and** filtered. Every form
  with eligible endings carries exactly one default; none carries two; no form with eligible
  endings carries zero.
- MJAPI restarted clean — no `not found in metadata`. Explorer rebuilt and picked up `forms-ng`.
- Manual smoke passed on all points, including the four re-tests after the delete-path fix.

### Defect found during smoke, fixed in the same commit

Deleting the default ending promoted nobody. The survivor then rendered
**"Never shown — add a condition"** while `resolveEndingScreen` was in fact falling through to it
(`ordered.find(isDefault) ?? ordered.find(no conditionalRule)`) and showing it to every
respondent — the builder and the runtime disagreeing about the same screen, in opposite
directions. Fixed by `vacantDefaultEnding` + the `deleteScreen` signature change above.

Two behaviours reported alongside it are **correct and must not be "fixed"**: a second
unconditional ending with no rule pointing at it genuinely never shows, and the warning badge
correctly follows whichever ending is unreachable as the default moves.

---

## Phase 2 — the catch-all, stated in the dialog ✅ (uncommitted)

**Shipped as a read-only line. The picker this section used to specify was built, reviewed and
removed — do not rebuild it.** The reasoning is in the changeset and in
`QUESTION_LEVEL_LOGIC_PLAN.md` §6; the short version is below.

### What the dialog does now

At the end of the "Then, after this ⟨item⟩" block, inside the existing `@if (allowJumps)` guard
so an ending never sees it:

> 🏁 Everyone who finishes lands on **Thanks for your response**, unless a rule sends them elsewhere.

and when nothing catches finishers:

> 🏁 No ending screen is set as the catch-all, so everyone who finishes sees the form's confirmation message.

The second sentence is true of **both** states that reach it — a form with no endings, and a form
whose every ending is screened out. The picker version said *"this form has no ending screen to
land on"* while the destination list two lines above was offering one.

### Why not the picker #74 asks for

The catch-all is form-level. Every question's dialog carried the control, so it needed a caption
saying *"this is a form-wide setting — changing it here changes it for every question."* A control
that needs that caption has already failed. `IsDefault` is authored in exactly one place — the
Default toggle on the Endings strip, made exclusive by Phase 1 — and a second writer buys
convenience at the cost of a warning label admitting it lies about its scope.

**Do not route it through the Then row either.** A jump rule needs a condition;
`ruleFromLogicDraft` drops a conditionless row on purpose, because `evaluateGroup({})` is
vacuously true and such a row would fire for everyone, swallowing every rule after it. "Then go
to → an ending" and "the default ending" are different things.

### Files

- **`logic-editor.component.ts`** — `@Input defaultEndingLabel: string | null`, and the two-branch
  line. Its own `.le-finish` class, **not** `.le-reach`: that one is `display: flex; gap: 6px`, so
  a sentence with a `<strong>` in it becomes three flex items — a stray gap before the comma, and
  `nowrap`, so the line cannot break on a phone. (Found by measuring in the browser; there is a
  test pinning that this line is not a flex row.)
- **`rules-panel.component.{ts,html}`** — passes `defaultEndingLabel` straight through. Also gains
  `dialogSubtitle`, branched on `allowJumps`: the subtitle promised an ending's author they could
  decide "where the respondent goes next", directly above a dialog with nowhere to decide it.
- **`question-editor` / `page-editor`** — one pass-through `@Input` each. Not `screen-editor`;
  `allowJumps=false` already excludes it.
- **`form-builder.component.{ts,html}`** — `defaultEndingLabel` getter, resolved through
  `defaultEndingId(tree.screens)` so screened-out endings are excluded exactly as
  `resolveEndingScreen` excludes them. `onMakeDefaultEnding` gains **`try/finally`**: it is the one
  call here that can THROW rather than return false, and without it a refused move left `busy`
  true and every guarded action in the builder inert.
- **`logic-draft.ts`** — **unchanged in the end.** An earlier pass added `defaultEndingId`, an
  `ItemLogicDraft` split and a second argument to `logicDraftOf`; all of it came back out when the
  control did. A read-only line writes nothing, so it needs no draft, no dirty term, no output.
- **Slice 0 (kept, unrelated):** four hand-written copies of `{ show: undefined, jumps: [] }` now
  go through `emptyLogicDraft()`, which already existed and was called by nobody.

### Verified, not assumed

- 2242 tests (forms-ng 1210 → 1218). `ngc` clean under `strictTemplates`; all four lints pass.
- Smoke-tested in the browser against MJ's host, all nine checks, plus: the read-only line
  measured as `display: block` with the comma attached after the flex fix; the picker's
  screened-out exclusion confirmed asymmetric (gone from the catch-all, still offered as a jump
  destination); database left with no form holding two defaults and none holding zero with an
  eligible ending.
- **Still open, not fixed:** nothing from Phase 2.

## Phase 3 — Delete all rules

**`logic-draft.ts`** — `clearJumpRules(draft)`. One line, but named so the intent is testable.

**`logic-editor.component.ts`** — a control to the right of `+ Add rule`, rendered only at
`jumps.length >= 2` (with one rule its own bin already does the job). Click swaps the row for an
inline confirm:

```
[ + Add rule ]        Delete all 5 rules?  [Delete all] [Keep]
```

**Scoped to the numbered jump rules, not the show gate** — the button lives in the "Then, after
this question" block, and the show gate has its own Always / Only-when toggle two inches above.
*(Open decision, see below.)*

**Do not touch `RuleEditorDialogComponent`'s `confirming` footer.** Its copy is hardcoded to
discard and is pinned by `rules-panel.dialog.wiring.spec.ts:234,256`. The confirm here is a local
boolean in the logic editor — which makes that component's header comment *"it holds no state of
its own"* inaccurate, so update it in the same commit.

Nothing persists until Done, so Cancel is already an undo; the confirm is cheap insurance, not
data protection.

---

## Phase 4 — close out

- ~~Update the `STATUS 2026-08-27` notes in `plans/QUESTION_LEVEL_LOGIC_PLAN.md` §6.~~ **Done for
  the "All other cases go to" bullet** (marked SUPERSEDED, with the reasoning and the
  jump-rule-can't-express-a-catch-all warning). The **Delete all rules** note is still accurate
  as "not built" and should be updated when Phase 3 lands.
- Changeset: `.changeset/when-they-finish.md` exists for Phase 2 (`patch` — no migration, and
  `logic-draft.ts`'s exported signatures ended up unchanged). Phase 3 needs its own.
- **Say the deviation on #74 itself**, not only in the changeset: the issue asks for a picker and
  a sentence shipped instead.
- Gates: `pnpm run build:packages` · `pnpm run test:packages` · `lint:ui` · `lint:migrations` ·
  `lint:distribution` · `lint:generated`.
- PR → `next`, closing #74.

---

## Constraints a fresh session will otherwise rediscover the hard way

- **These components cannot be unit-tested here.** Decorated Angular classes will not instantiate
  in the vitest node environment (see `rules-panel.dialog.wiring.spec.ts`'s header). Behaviour must
  live in pure modules; wiring gets source-regex structural guards with comments stripped first.
  `ngc`'s `strictTemplates` is the only real check on template edits — run it directly
  (`cd packages/Angular && npx ngc`), because turbo will happily serve a cached `forms-ng` build.
- **The builder does not run in this repo.** There is no Explorer here. It runs in MJ's host at
  `../MJ` (`pnpm start`, Explorer `:4201`, API `:4000`) with this repo linked in. Check
  `lsof -nP -iTCP:4000 -sTCP:LISTEN` first — it is often already up.
- **The default-ending write order is enforced by the database.** Any new path that touches
  `IsDefault` must go through `setDefaultEnding`, or clear-before-set by hand.
- **Migrations:** next file must sort after `V202608271200`. `lint:migrations` checks it. Only
  `${flyway:defaultSchema}` and `${mjSchema}` may appear in shipped SQL.
- **Smoke testing is the user's.** Hand over a check list; do not claim browser verification.

## Open decision

**Does "Delete all rules" also clear the show gate?** Planned as *no* — scoped to the numbered
jump rules, matching the block the button sits in. If it should wipe everything, the control moves
to the top of the dialog and is renamed **"Clear all logic"**. The vocabulary is genuinely
ambiguous: the rail's `hasRules`/`summaryRows` counts the show gate as a rule, the dialog numbers
only the Then rows.

## Phase 2's design history, so it is not relitigated

Three designs were considered and the **read-only line won on review, after the picker was fully
built**. Recorded because #74 still reads as a request for the control:

- **A picker writing `IsDefault` through the draft** — built, smoke-tested, removed. Needed a
  "this is a form-wide setting" caption; that caption was the tell.
- **A dropdown embedded in the hint sentence** — fiddly on mobile, and shrinks the form-wide
  warning to a tooltip.
- **A read-only line** — shipped. Answers the question where it is asked, adds no second writer,
  and deleted most of the machinery the picker needed.

**Say this on #74 when the PR goes up.** The issue asks for a picker; shipping a sentence is a
considered deviation, and if it is not said out loud the next person will read the issue and
"finish" it.

## Related

- **#73** — reordering can silently break rules. Out of scope; overlaps nothing here.
- **#75** — filed during Phase 1 smoke. Preview and the live link resolve the ending screen
  differently: preview hosts the widget against a deliberately inert connection, and the widget
  only resolves an ending in its *submit-result* handler, so no submit means no resolution. The
  live link goes through the server. Argues for one resolver with three consumers.
- `plans/QUESTION_LEVEL_LOGIC_PLAN.md` §6 — the original spec for both controls.
