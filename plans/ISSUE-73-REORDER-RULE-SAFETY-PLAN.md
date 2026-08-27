# Issue #73 — a reorder can break a rule, and nothing says so

Closes [#73](https://github.com/MemberJunction/bizapps-forms/issues/73). Follow-up to #72/#74.
Branch to cut **from `next`** (currently `98abfc0`), tracking `origin/<branch>` — not
`origin/next`, per the repo's branching rule.

Revision 2, after a design review; §1.4, §1.6, §2, and the three amendments in §4 come from it,
and §3.2 corrects it. Revision 3 records what landed.

## Status — Phase 0 ✅ · Phase 1 ✅ · Phase 2 ⏳

Branch `fix/73-reorder-rule-safety`, from `next` @ `98abfc0`, tracking `origin/<same-name>`.

| Phase | State | Commit |
|---|---|---|
| 0 — one statement of the ordering rule | **landed** | `refactor(builder): state the rule read horizon once` |
| 1 — a rule that cannot read its own source is broken | **landed** | see §4 |
| 2 — say it at the drag, and offer the one move that undoes it | **not started** | — |

**What the build changed about this plan, and why.** Four things, all found by building or by driving
the real UI:

1. **`formSources`, not `laterSources`** (§4 Phase 1). The plan had the host compute the complement
   per verb. A `show` gate and a `jump` on the same item have different `sources`, so that needs
   *two* new inputs at every level of the chain (~10 in all). One form-wide list serves both, and
   the "later" set is differenced against the very array the `<select>` is rendering, so the two
   cannot drift. Empty is the safe default — an unwired host keeps the old wording rather than
   making an ordering claim it has no evidence for. The decision itself is `staleSourceLabel` in
   `condition-sources.ts`, pure and unit-tested, rather than a template literal.
2. **The stale prose was in EIGHT places, not four** (§1.4). Also wrong:
   `rules-panel-model.spec.ts:165` and `rules-inventory.spec.ts` ×3. All corrected. A ninth,
   `templates/clone-remap.ts:15`, makes the same claim about an unmapped clone reference — left
   alone as outside this change's blast radius, and logged below.
3. **A surface the plan missed: the properties rail.** After a reorder its summary read
   `Show only when (deleted question) is answered` about a question one row above it, because
   `describeCondition` was resolving prompts against the rule's *legal prefix*. Naming and legality
   are two questions; `rules-inventory.ts` had already worked that out and documented it, and the
   rail simply had not been given the same list. Fixed in `rules-panel.component.ts`.
4. **The badge's message was unreadable, so Phase 1 was not actually delivered.** It was a native
   `[title]`, which `setting-row.component.ts:46` had already rejected in this repo for the exact
   reason that bit here: the browser waits about a second, so a hover that does nothing reads as a
   broken control — on the badge whose whole job is to report a broken rule. Reported by the
   developer during the Phase 1 smoke pass. Now one standalone `mjf-rule-badge` component (three
   call sites carried the identical span) with an immediate CSS bubble, `pointer-events: none`,
   `white-space: pre-line` for multi-rule details, and an `aria-label` the badge never had.

**Two fixture-honesty problems surfaced by Phase 1**, both in `rules-inventory.spec.ts` and both
describing forms nobody can build. Six fixtures gave a rule a source present in `sources` but on no
page — the state that helper's own comment warns about, now impossible because `form()` tops up
*both* directions. Two more hung `showVip` (which reads `q1`) on `q1` itself: a rule reading its own
answer, which the picker has never offered and which Phase 1 correctly calls broken.

**Logged, not fixed** — `storedTargetLabel` (`jump-target-options.ts:119`) has the identical defect
for jump DESTINATIONS: a target that still exists but is no longer ahead of its rule renders
`(a question that no longer exists)` in the rail. The canvas badge already says the truth
(`UNREACHED_DESTINATION`), so only the rail line lies. Fixing it means threading a form-wide
*target* list (questions + pages + endings) the way `formSources` was threaded. Outside Phase 1;
fold into Phase 2 or take as a follow-up issue.

---

## 1. Verified against the source, and reproduced

Every behavioural claim below was driven through the real `FormRuntime`, the real
`evaluateConditionalRule` and the real `collectRuleEntries` in throwaway specs, then deleted
(§1.7). Nothing here is read-only inference.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `reorderQuestion` writes only `DisplayOrder`, never rule JSON | ✅ | `form-builder.component.ts:1208-1217` → `builder-state.service.ts:606-616`. Three statements: `moveItemInArray`, `persistQuestionOrder`, `markDirty`. |
| 2 | No section reorder, no cross-section question move | ✅ | One `cdkDropList` per page (`form-builder.component.html:362-364`), no `cdkDropListConnectedTo`, no `transferArrayItem`, no page-order write. |
| 2b | Adding a question or a section cannot create this either | ✅ | §1.5 — proved from the write paths. |
| 3 | The condition picker offers earlier questions only | ✅ | `conditionalSources` (`form-builder.component.ts:1021`). |
| 4 | `brokenIn` checks existence, not readability | ✅ | `resolves()` in `rules-inventory.ts` is `sources.some(s => s.id === condition.questionId)`. |
| 5 | `jumpReach` already computes inertness; the badge already shows it | ✅ | `UNREACHED_DESTINATION`, fed by `jumpReach(...).inert`. Same rule: `inert:false` before a drag, `inert:true` after. |
| 6 | Nothing warns at the drag | ✅ | See #1 — there is no third thing for it to do. |
| 7 | A forward-reading `show` rule hides the item **permanently** and **never recovers** | ❌ **wrong** | §1.1. It recovers, visibly and badly. |
| 8 | — | ➕ **also true of a `jump`'s `when`, and worse** | §1.2. |
| 9 | The Edit-logic dialog needs a new line | ➕ **it has one, and it lies** | §1.3. |
| 10 | — | ➕ **the same falsehood is already written in four places about deleted sources** | §1.4. In blast radius. |
| 11 | — | ➕ **only rules on the moved page can newly break** | §1.6. Brute-force verified; a testable narrowing and a canary. |

### 1.1 What a forward-reading `show` rule actually does

`FormRuntime` does not walk the form once. `settledAnswers` (`form-runtime.ts:172-194`) iterates
"restrict the answers to the currently-rendered set, re-derive from them" to a **fixed point**, and
`renderedQuestions` is a reading of that. So a condition naming a question further down is not read
once and lost; it is re-read on every keystroke.

Reproduced, one section, `Gated` (show: `Source = yes`) above `Source` above `Tail`:

* **Scroll** (section-at-a-time): rendered is `[Source, Tail]`. The respondent answers `Source` and
  rendered becomes `[Gated, Source, Tail]` — **a question appears above where they are reading**, in
  a section they have already started. That is the retroactive-mutation failure `section-content.ts`
  exists to narrate for jumps, and its skipped-run notice does not cover it: that notice only
  describes questions a jump *removed*.
* **OneQuestion**: the cursor is a positional index and `clampCursor` only fires when the path
  *shrinks*. The respondent is on cursor 0 = `Source`, answers it, the path grows to
  `[Gated, Source, Tail]`, cursor 0 is still in range — and now points at `Gated`. **The screen
  swaps under them to a question they never saw, with no keypress**, and Next returns them to the
  question they just answered.
* With `isNotAnswered` or `notEquals` the constant runs the other way and the item is shown to
  **everyone**, forever. "Hidden" is not even the right direction.

The accurate statement, and the one the badge must make:

> **the rule reads a question that is not answered until later, so when it runs there is nothing
> there. Whatever it decides, it decides the same way for everyone — and changes its mind
> afterwards, in front of the respondent.**

Not pedantry. "Hidden from every respondent, permanently" is disprovable in Preview in ten seconds,
and a badge caught lying once is a badge nobody reads again — including the day it is right about a
deleted question.

### 1.2 The same hazard on a jump's `when` — not in the issue, and worse

`questionJumpSources` offers every question **up to and including** the rule's own, so a drag that
moves one of those below the rule produces a `jump` reading a later answer. Reproduced, `Q1`
carrying *"if Q3 = yes, go to Tail"* after `Q3` was dragged below it:

1. Nothing fires; all four questions render. The respondent types an answer into `Q2`.
2. They answer `Q3 = yes`.
3. The jump fires **retroactively**: rendered collapses to `[Q1, Tail]`, and `Q2` — with the answer
   they typed — is gone from `transmittedView().answers`. It is never submitted.

Same root cause, same fix, strictly more damage. One check covers both verbs.

### 1.3 The dialog already reports it, incorrectly

`staleQuestion` (`conditional-rule-editor.component.ts:260`) already notices a stored `questionId`
absent from `sources` and renders it as a disabled option reading **`(question no longer
available)`** (`conditional-rule-editor.component.html:47`). After a drag that is false — the
question is two rows down on the canvas. The dialog work is *stop saying the wrong thing*, which
needs the dialog to tell the causes apart.

**Three causes, not two.** `staleQuestion`'s own doc names two — deleted, or converted to a type
that collects no answer (a `Statement`, dropped by `toConditionalSource`) — and this change adds a
third. §4 keeps the existing label for the `Statement` case deliberately; see the note there.

### 1.4 The prose in four places is already wrong about deleted sources

Four comments assert that a condition naming a deleted question "is NOT_EVALUABLE, which the
evaluator reads as `false`, so the item it guards is hidden from every respondent":
`rules-inventory.ts:17`, `rules-inventory.ts:475`, `rules-panel-model.ts:82`,
`rule-badges.wiring.spec.ts:11`.

Both halves are wrong, and reproduced:

* **Not `NOT_EVALUABLE`.** `conditionOperand` returns that sentinel only for a missing/empty
  `questionId` or a score with no score supplied. A *deleted* question still has an id, so the
  operand is a plain `undefined`.
* **Not uniformly `false`.** `undefined` with `isNotAnswered` is **`true`**; so is `notEquals`. A
  `show` rule reading a deleted question with either operator shows the item to **everyone**.

This is the same "runs the other way for everyone" property §1.1 was written to capture, on the
class that already ships. Landing a carefully truthful new message beside four comments asserting
the falsehood is exactly the stale-comment case the repo's design rules name, and it is inside this
change's blast radius. Corrected in Phase 1, with a spec so it cannot drift back.

### 1.5 Adding a question, or a section, cannot create either defect

Stated as a proof rather than a spot check, because it is the load-bearing reason Phase 2 hooks one
method. **Every non-reorder write path appends or removes; none inserts at an index.**

| Path | Effect on order | Source |
|---|---|---|
| `addQuestion` | `DisplayOrder = page.questions.length`, then `push` — appends to the end of the target page | `builder-state.service.ts:232`, `form-builder.component.ts:471` |
| `addPage` | `DisplayOrder = tree.pages.length`, then `push` — appends after every section | `builder-state.service.ts:208` |
| Import (paste a list) | loops `createImportedQuestion` → `addQuestion`; target is a freshly appended page or the last one | `form-builder.component.ts:978-982` |
| Clone a form | copies `DisplayOrder` verbatim, remaps rule ids | `form-clone.service.ts:194/235/278/311` |
| `deleteQuestion` | filter, then renumber to array order | `form-builder.component.ts:1191-1192` |
| `deletePage` | filter the page out; survivors keep their numbers | `form-builder.component.ts:568` |

There is **no duplicate-question control, no "add below this one", no insert-at-index**.
`targetPageForNewQuestion` picks *which* page a new question lands on — the one holding the
selection, else the last — but it always lands at the **end** of it.

**Why that settles it.** Both checks here are about the *relative* order of exactly two things: a
rule and the question its condition reads (§3.2), or a rule and its `Go to` target (`jumpReach`).
Appending shifts absolute indices but **inverts no surviving pair**; removing deletes pairs and
inverts none. Where an add or delete does break a rule it is by deleting one of its ends — the
existence class `MISSING_QUESTION` / `MISSING_PAGE` / `MISSING_ENDING` has always reported.

Two consequences worth being explicit about:

* A question added **between a rule and its `Go to` target** changes what the rule skips and the
  rule still runs. #73 lists that as working-as-intended for drags; same fact for adds.
* A question added **to a section** extends that section's page-`jump` horizon and leaves its
  page-`show` horizon untouched. Strictly more readable, never less.

**Rules that arrive already broken are still reported.** The AI builder, `mj sync` metadata, import
and clone can all produce a forward-reading condition with no drag involved — nothing validates
order on the way in. Phase 1 is a property of the tree, evaluated every render, so those are badged
at rest exactly like a dragged one. Only the *drag-time notice* is reorder-specific, and that is
correct: a notice interrupts a change the author just made, and loading a form is not one.

### 1.6 Only rules on the moved page can newly break

A within-page move changes neither `questionsBefore(page)` for any page nor cross-page membership.
Every index on a later page still exceeds every index on an earlier one, so:

* page-level `show` and `jump` horizons are unchanged by any move;
* a rule whose source or target is on another page keeps its relative order with it;
* only a rule sitting on a question of the moved page can invert against a source or target that
  also moved.

**Verified by brute force**, not argued: over a two-page fixture carrying a page `show` reading an
earlier page, a page `jump` reading its own page, cross-page question rules and a jump targeting a
question on the other page, every legal within-page move on both sections newly broke only entries
whose `itemId` is a question on the moved page. A companion assertion confirms the moves *do* break
same-page rules, so the property is not vacuously true.

This is a permanent property test (§6). It is also the canary: it fails the day cross-section moves
or section reordering land, which is the day Phase 2's diff has to widen.

### 1.7 How to re-run the reproduction

Every case above was driven in scratch `.spec.ts` files under `packages/Angular/src/lib/builder/`,
then deleted. Phases 1 and 2 turn each into a permanent spec; none needs a database or a browser.

---

## 2. Constraints this design does not get to trade away

Given by the platform. Written down because each one has already caused a wrong design somewhere in
this file's history.

1. **The resolver is one forward walk, and `jump-reach.ts` mirrors it.** `flattenStops`
   (`rule-verbs.ts:183`) gives a page **two** stops — entered and left — with its `Go to` firing at
   the second. All horizon arithmetic is a restatement of that walk. If the resolver's shape
   changes, this module *lies* rather than fails, which is why `jump-reach.spec.ts` pins it.
2. **Visibility is a fixed point, not a single pass** (`form-runtime.ts:172-194`,
   `MAX_VISIBILITY_PASSES = 5`). Rules are re-read on every keystroke. This is what makes a
   forward-reading rule a live defect rather than a one-shot one, and it is the constraint the
   badge's wording must survive.
3. **Visibility is not monotone.** `isNotAnswered` means removing an answer can *reveal* a question,
   so the iteration is not guaranteed to converge. The cap `console.warn`s and uses the last
   derivation — reproduced, and it is reachable from two mutually-referencing `show` rules.
4. **The widget iterates so that the server's single pass agrees.** `settledAnswers` returns the
   restricted map "whose single-pass derivation is that set, which is exactly the pass the server
   makes over the payload", and `transmittedView` does that one pass. Divergence lands on the
   anonymous path with no recovery, so nothing here may introduce a second notion of visibility.
5. **`sourcesOf` filters.** `toConditionalSource` drops non-answerable types, so the source list is a
   *subset* of the ordered question list. **Index arithmetic must run on the full list; existence
   and labelling on the filtered one.** Mixing them silently shifts every horizon on a form
   containing a `Statement`.
6. **Rule JSON is never rewritten by a reorder.** §5 is right about why.
7. **One statement of the ordering rule.** It exists four times today
   (`form-builder.component.ts:665`, `:684`, `:795`, `:1021`) and zero times in
   `rules-inventory.ts`. That asymmetry *is* the bug in item 2.
8. **The drag path knows nothing about rules** — only that the broken set grew.

---

## 3. The design

### 3.1 The framing that collapses both items into one mechanism

The two halves of #73 are **the same question asked at two different times**:

> *Is every rule on this form still readable in the order the form is walked?*

Item 2 asks it at rest — the badge, the dialog. Item 1 asks it at the moment of a change — the drag.
Rule health is already a pure function of the tree (`collectRuleEntries`), so item 1 is not a new
subsystem:

```
before = broken rules
move
after  = broken rules
notice = after − before
```

Every future breakage class added to `collectRuleEntries` is warned about at the drag for free, with
no second place to remember. That is why this ships as one new pure function plus a set difference
rather than as a drag-time rule validator.

### 3.2 The one missing primitive: the read horizon

`jump-reach.ts` already owns *where in the walk a rule fires* (`fireIndex`). The fact nobody has
written down is the **read horizon**: the highest index into the form's question list that a rule's
conditions may legally read.

| Rule sits on | Verb | Fires | Horizon |
|---|---|---|---|
| question | `show` | before the question renders | `indexOf(q) − 1` |
| question | `jump` | after the question is answered | `indexOf(q)` |
| page | `show` | when the page is entered | `questionsBefore(page) − 1` |
| page | `jump` | when the page is left | `questionsBefore(page) + len − 1` |
| ending | `show` | at submit | everything — not asked |

That table is not new information. It is **already stated four times**, in four getters that each
hand-slice the tree. `sourcesOf`'s own comment records that a previous pass unified *which questions
map to a source* for exactly this reason; it did not unify *which prefix*. So the ordering rule
lives in four places and the module that reports broken rules is not one of them.

**Two identities, not five rows.** The table collapses onto primitives `jump-reach.ts` already has:

```
jumpHorizon(source) = fireIndex(pages, source)
showHorizon(source) = startIndex(pages, source) − 1
startIndex(question) = fireIndex(question)
startIndex(page)     = fireIndex(page) − page.questions.length + 1     // NOT − length
```

Verified numerically against all four current getters over a fixture including an **empty section**
and a mid-form `Statement`. The `+ 1` is load-bearing and is where the review's restatement was off
by one: on a fixture whose third section follows two questions, the correct show horizon is `1`
(both readable) and `fireIndex − length` yields `0` (only the first). Shipping it would have
narrowed the page-`show` picker by one question **and** falsely badged a legal page rule that reads
the last question of the previous section — a wrong answer in both directions from the one place
that is supposed to be the single answer.

**One function, in `jump-reach.ts`:**

```ts
/**
 * The highest index into the form's question list that a rule on `source` may read.
 * `-1` when it may read nothing.
 */
export function readHorizon(
  pages: readonly ReachPage[],
  source: ReachSource,
  verb: 'show' | 'jump',
): number
```

**An unresolvable source reports everything readable, not nothing** — and that is the *opposite*
return from `jumpReach`, which reports `INERT` for the same input. Both mean "claim nothing": there,
the alarming claim is "this jump skips the rest of the form"; here, it is "every condition on this
rule is broken". Same input, two opposite returns, both correct. It carries a comment at the
definition saying so, or the next reader will "fix" one of them.

`ReachSource` is unchanged — it has no `'ending'` kind, and adding one would be adding a kind that
is illegal for `jumpReach`, which shares the type. Endings read everything; `endingConditionalSources`
already says so and keeps saying it.

### 3.3 What the horizon buys, in order

1. **The four getters collapse onto it** (Phase 0, no behaviour change). The picker and the badge
   then answer *"can this rule read that question?"* from one piece of arithmetic. They cannot
   disagree, which is the only durable fix for item 2.
2. **The badge lights up** (Phase 1): one comparison, one message, both verbs, both item kinds.
3. **The drag notice is a set difference** (Phase 2), needing no knowledge of rules.
4. **Undo is the same method with its arguments swapped.** `moveItemInArray(a, from, to)` is
   inverted exactly by moving the same element back to `from`, so Undo re-enters `reorderQuestion`,
   re-runs the diff, finds nothing newly broken, and clears its own notice. No command stack.

---

## 4. Phases

### Phase 0 — one statement of the ordering rule ✅ *(refactor, no behaviour change, own commit)*

Make the change easy, then make the change.

**`jump-reach.ts`** — export `readHorizon` per §3.2, over the existing `questionsBefore` and flat
question list, with the opposite-null comment. `fireIndex` is unchanged.

**`form-builder.component.ts`** — `pageConditionalSources`, `pageJumpConditionSources`,
`conditionalSources` and `questionJumpSources` each become
`this.sourcesUpTo(readHorizon(this.reachPages, source, verb))`, where `sourcesUpTo` slices the
**full** ordered question list and then maps through the existing `sourcesOf` (constraint 2.5:
arithmetic on the full list, filtering after). `endingConditionalSources` is untouched — everything
plus `SCORE_SOURCE`. Factor the `{ id, questions: [{ id, isRequired }] }` projection currently
inlined in `reachNotesFor` into one private `reachPages` getter; three call sites now need it.

### Phase 1 — a rule that cannot read its own source is broken ✅

**`rules-inventory.ts`**

```ts
const UNREADABLE_SOURCE =
  'a question that is answered later than this rule runs, so the rule reads a blank';
```

* `brokenIn` takes `(group, form, source: ReachSource, verb)`. **No new plumbing**:
  `RuleInventoryPage[]` already structurally satisfies `ReachPage[]`, and `itemEntries` relies on
  that today when it calls `jumpReach(form.pages, …)`. The ordered id list comes from `form.pages`;
  existence keeps coming from `form.sources`.
* Reasons are collected **per condition** and deduplicated, so a rule naming one deleted question
  and one moved-below question reports **both**. A condition that does not resolve reports
  `MISSING_QUESTION` and is not also tested for readability — there is no index to compare.
* Applied to both verbs — a question/page `show` group and every `jump`'s `when`. Endings are not
  asked.
* **Correct the four stale comments** of §1.4 to say what the evaluator does: a deleted source makes
  the operand `undefined`, which is `false` for the equality family and **`true`** for
  `isNotAnswered`/`notEquals` — so the guarded item is pinned open or pinned shut for everyone,
  depending on the operator. Same class as the new message, which is why they now read alike.

**`conditional-rule-editor.component.*`** — stop lying (§1.3)

* One new input: `@Input() laterSources: ConditionalSourceQuestion[] = []`, the questions that exist
  but sit past the horizon. The host computes it as the complement of the same `readHorizon` call,
  so the two sets are one decision.
* `staleQuestion`'s disabled option is labelled from it:
  * id in `laterSources` → `"{prompt} — answered after this rule runs"`
  * otherwise → `"(question no longer available)"`, unchanged.
* **The `Statement` cause keeps the existing label, deliberately.** Distinguishing it needs the full
  question list threaded into the editor to serve a case no drag can create, and the label is not
  false for it — a `Statement` genuinely is not available as a source. Noted in the code so the
  third cause is not mistaken for an oversight.

Nothing else changes: `ruleBadgesFor` already turns any non-empty `broken[]` into the warning badge
and its tooltip line.

### Phase 2 — say it at the drag, and offer the one move that undoes it ⏳ *(next)*

**`reorder.ts`** grows from "is this move legal" to "what does this move cost" — the same subject,
and pure, which is the only way any of it can be unit-tested (component classes are not instantiated
in this suite).

```ts
/** Rules carrying a reason they did not carry before. */
export function newlyBrokenRules(
  before: readonly RuleEntry[],
  after: readonly RuleEntry[],
): RuleEntry[] {
  const was = new Map(before.map((e) => [e.id, new Set(e.broken)]));
  return after.filter((e) => e.broken.some((reason) => !was.get(e.id)?.has(reason)));
}

/** The one sentence the author reads, or '' when nothing broke. */
export function reorderNoticeText(
  movedLabel: string,
  broken: readonly RuleEntry[],
  labelOf: (itemId: string) => string,
): string
```

**Keyed on `(entry.id, reason)` pairs, not on entry ids.** Keyed on ids alone, a rule already broken
by `MISSING_QUESTION` that *also* becomes unreadable is silently not reported — the case where the
author has the most to fix.

Two sentence forms, both always true:

> `Moved "Email". This broke 1 rule on "First name".`
> `Moved "Email". This broke 3 rules — the affected questions are badged.`

The single-item form is used when every newly-broken rule sits on one item, which is the common case
and the one the issue writes out. **The notice does not explain the breakage** — the badge already
does, in full, on the item it is about.

**`form-builder.component.ts`** — the diff hooks `reorderQuestion` and nothing else, because §1.5
proves it is the only write that can invert a pair. Not because the other paths went unconsidered.

```ts
/** A reorder that broke something, and enough to put it back. */
private reorderNotice: {
  readonly text: string;
  readonly pageId: string;
  readonly questionId: string;
  readonly originalIndex: number;   // where it came FROM — that is where Undo returns it
} | null = null;

private async reorderQuestion(page: PageNode, from: number, to: number): Promise<void> {
  if (this.busy || !isValidReorder(from, to, page.questions.length)) {
    return;
  }
  const moved = page.questions[from];
  const before = this.ruleEntries;
  moveItemInArray(page.questions, from, to);
  const text = reorderNoticeText(
    moved.entity.Prompt,
    newlyBrokenRules(before, this.ruleEntries),
    (id) => this.itemLabel(id),
  );
  // The write half is reported by `state.lastFailure()`, which owns it. The band below is about
  // what is ON SCREEN, and stays true whether or not the DisplayOrder writes stuck.
  await this.state.persistQuestionOrder(page);
  this.markDirty();
  this.reorderNotice = text.length > 0
    ? { text, pageId: page.entity.ID, questionId: moved.entity.ID, originalIndex: from }
    : null;
}

protected async undoReorder(): Promise<void> {
  const notice = this.reorderNotice;
  this.reorderNotice = null;
  const page = this.tree?.pages.find((p) => p.entity.ID === notice?.pageId);
  const index = page?.questions.findIndex((q) => q.entity.ID === notice?.questionId) ?? -1;
  if (!notice || !page || index < 0) {
    return; // the question or its section is gone — there is nothing to put back
  }
  await this.reorderQuestion(page, index, Math.min(notice.originalIndex, page.questions.length - 1));
}
```

**Keyed on ids, not indices**, and this is the amendment that removes a whole class of failure
rather than commenting around it. Revision 1 stored `{page, from, to}` and relied on `markDirty()`
to retire a stale Undo. `markDirty()` is the wrong clock: it fires on **every keystroke** in a
prompt, an option label or a page title, and once from an async `.then()` inside a background
`MJGlobal` automation-event subscription (`form-builder.component.ts:1294`) — clearing a standing
Undo for reasons that have nothing to do with the author. And the invariant it needed ("every path
that shifts `from`/`to` calls `markDirty` before the author can click") is not something a
source-text spec can guard. Resolving by id at click time is `indexOf`, not an algorithm, and it
makes moving the wrong question **unrepresentable**. The special case is out of existence, not
documented.

**`persistQuestionOrder`'s return is checked**, where today it is discarded. It writes per question
and can fail halfway, leaving the database in a third state matching neither before nor after; the
existing failure band already owns saying so, and this keeps the two bands about two different
things.

**`form-builder.component.html` / `form-builder.styles.ts`** — a second band beside the existing
`.fb-failure` one, warning-toned (`--mj-status-warning-*`), `role="alert"`, carrying **Undo** and a
dismiss. Same markup shape and token discipline as the band above it; confirm left, cancel right.
**No timer** — the notice stands until dismissed or superseded. An auto-hiding warning about
something silent is how we got here.

---

## 5. Rejected, with reasons

**Auto-repair the rule.** #73 argues the tool cannot tell "I moved this because everyone should
answer it first" from "I was tidying the layout". §1.2 supplies the asymmetry: a *repaired* jump
that guesses wrong deletes a respondent's already-typed answer from the submission and nobody finds
out; an unrepaired one fails loud on the canvas. Report, never rewrite.

**`MJNotificationService.CreateSimpleNotification`.** The right instinct, and it does not fit, for
reasons that are facts about the API. It takes `(message, style, hideAfter)` and renders a toast
whose only control is a close button (`MJ/packages/Angular/Generic/notifications/src/lib/notifications.service.ts`):
**no action slot**, so it cannot carry the Undo, and it auto-hides by default. It would also add
`@memberjunction/ng-notifications` as a peer dependency `forms-ng` does not carry and which is not
installed. Adopting an MJ package to get a control that cannot do the job is the wrong reading of
"use the built-in where one exists" — here one does not.

**Reuse the `.fb-failure` band.** `lastFailure` means one thing: *the database refused a write*.
Widening it to "and also, consequences of things that succeeded" makes a clear signal vague, and the
two genuinely co-occur.

**A drag-time rule checker.** A second implementation of "is this rule broken" that can disagree
with the badge. The diff over `collectRuleEntries` cannot disagree with the badge because it *is*
the badge.

**An undo stack.** One operation, one inverse, one notice.

**Blocking the drag.** The reorder is legitimate; the rule is what is now wrong.

---

## 6. How correctness gets demonstrated

All `.spec.ts`, colocated, the convention in `packages/Angular/src/lib/builder/`.

| Claim | How it is proven |
|---|---|
| The horizon is the ordering rule, stated once | `jump-reach.spec.ts`: the two identities of §3.2 — jump horizon ≡ `fireIndex`, show horizon ≡ `startIndex − 1` with the `+1` page arm — plus `-1` for the first question and for section 0, and everything-readable for an unresolvable source |
| Phase 0 changed nothing | A spec that runs the **old slice arithmetic transcribed literally** and the new `sourcesUpTo(readHorizon(…))` over one fixture tree and asserts identical output for all four getters, over a fixture containing an **empty section** and a `Statement` in the prefix. This is the spec that caught the review's off-by-one; it stays as the frozen oracle |
| A rule that cannot read its source is broken | `rules-inventory.spec.ts`: `show` with the source moved below; a `jump`'s `when` reading later (§1.2); earlier-reading `show` untouched; one deleted **and** one moved-below reports both; `source:'score'` exempt; an ending reading the last question exempt |
| The evaluator does what the comments now say | `conditional-rule.spec.ts`: a deleted source is `false` under `equals` and **`true`** under `isNotAnswered`/`notEquals`, and is *not* `NOT_EVALUABLE` (§1.4) — so the corrected prose cannot drift back |
| The drag notice is a set difference | `reorder.spec.ts`: newly-broken returned; `[]` for a harmless move; an already-broken rule not re-reported; **a rule that gains a second reason IS reported**; appending a question reports nothing (§1.5); both sentence forms |
| Only same-page rules can newly break | Property test in `reorder.spec.ts` over a two-page fixture: for every legal within-page move, every entry in `newlyBrokenRules` has an `itemId` on the moved page — plus the non-vacuity assertion that same-page rules do break (§1.6). Fails loudly the day cross-section moves land |
| Undo cannot move the wrong question | `reorder.spec.ts` on the id-keyed resolver: stale ids → no move; shifted indices → the moved question still lands at `originalIndex`, clamped |
| The badge's wording is true of the widget | `form-runtime.spec.ts`: (a) a forward-reading `show` reappears once the later source is answered, Scroll; (b) a forward-reading `jump` fires retroactively and drops the skipped answer from `transmittedView`; (c) the oscillating variant exhausts `MAX_VISIBILITY_PASSES` and `console.warn`s — reproduced, and the case where builder and respondent diverge most |
| The band is wired, and is not `.fb-failure` | `rule-badges.wiring.spec.ts`, source-text, comments stripped. Also guards §1.5's append-only invariant — no `transferArrayItem`, no `cdkDropListConnectedTo`, no page-order write — so a future duplicate-below or move-to-section fails here and points at §1.5. **No `markDirty` ordering guard**: the id-keyed notice makes it unnecessary |

**Beyond unit tests.** Per `.claude/rules/testing.md`, green units are necessary and not sufficient
for anything the respondent meets. Nothing here changes the public path — no migration, no server
change, no snapshot-shape change — so the smoke suite is unaffected.

**Smoke pass actually run, phases 0 and 1** (2026-08-27, by the developer, in MJ's host —
`cd ../MJ && pnpm start`, Explorer `:4201`; there is no Explorer in this repo). A fixture form
*"Issue 73 fixture"* was built to the shape the arithmetic is falsifiable on — `p1: Q1 · Statement ·
Q3` / `p2: (empty)` / `p3: Q4 · Q5` — and every picker read directly off the DOM. Phase 0: all four
source lists offered exactly what they offered before the refactor, including the case that catches
the page-arm off-by-one (section 3's show gate offers `Q3`, which `fireIndex − questions.length`
would have dropped) and the case that catches index arithmetic run on the filtered list (the
`Statement` is never offered and never shifts the questions around it). Phase 1: authoring `Q5 show
when Q4 is answered` badged healthy; moving `Q5` above `Q4` flipped it to **Rule is broken** reading
*"…answered later than this rule runs, so the rule reads a blank"*, the rail summary named `Q4 on
page 3` instead of "(deleted question)", and the Edit-logic picker showed a disabled `Q4 on page 3 —
answered after this rule runs`; `Q4`'s own earlier-reading rule stayed `Conditional` throughout;
moving `Q5` back cleared the badge; and deleting `Q3` produced the OTHER message — *"a question that
no longer exists"* — proving the two causes still read differently. One failure was found and fixed:
hovering the badge showed a help cursor and no message (native `title`, ~1s delay), now an immediate
bubble that does not swallow clicks on the card beneath it. Console clean, zero
`not found in metadata` on every restart.

**Manual pass still owed for Phase 2** (same host):

1. Two questions in one section, `show` on the first reading the second → warning badge on the
   first, `— answered after this rule runs` in its Edit logic picker.
2. Drag the source below → band naming the moved question; **Undo** → band clears, badge clears,
   order restored.
3. Drag a question with no rules → no band.
4. Preview the broken form and confirm the badge's wording matches what the widget does (§1.1).
   **This is the one claim no unit test can check** — a spec can prove the widget reappears the
   question, only a human can judge whether the sentence describes it.
5. Preview the two mutually-referencing `isNotAnswered` rules of constraint 2.3 and read the console
   warning. This is where the builder's badge and the respondent's experience diverge most, and a
   reviewer will not believe it without seeing it.

---

## 7. Non-goals, stated so they are not read as omissions

* **Publish is not gated on broken rules.** `publishControlState` decides on fingerprint and dirty
  state; nothing consults rule health, and this change does not add it. An author may publish a form
  with a badged rule.
* **A reorder that *repairs* a rule says nothing.** The diff is one-directional by design: an
  interrupt is for a consequence the author did not ask for.
* **The Undo does not take focus.** The arrow-button path (`moveQuestion`) raises the same band, and
  that is the keyboard path — but stealing focus mid-reorder would break repeated arrow presses.
  `role="alert"` announces it; reaching Undo is a Tab away. Named because it is a real limitation,
  not an oversight.
* **The `Statement`-conversion cause of `staleQuestion` keeps its current label** (§4, Phase 1).

---

## 8. Constraints a fresh session will otherwise rediscover

* **`.spec.ts`, not `.test.ts`**, and `@memberjunction/test-utils` is not installed here.
* **Angular component classes are not unit-tested** in this suite (node env, decorated inputs).
  Anything that must be tested goes in a pure module; components get source-text `.wiring.spec.ts`
  guards with comments stripped first.
* **No hardcoded colours.** The band uses `--mj-status-warning-*` / `--mjf-*` tokens or it breaks
  dark mode.
* **Index arithmetic on the full question list, filtering after** (constraint 2.5). A `Statement`
  anywhere in the prefix is the case that catches a violation.
* **The Phase 2 notice is wired to `reorderQuestion` alone, and §1.5 is why.** If insert-at-index, a
  duplicate-below, a move-to-another-section or a section reorder ever ships, that proof lapses and
  the diff must wrap the new write. Phase 1's badge needs no such change — it is a property of the
  tree.
* **Nothing here touches `migrations/`, the published snapshot, or the server.** No CodeGen run, no
  `mj sync push`, no seed regeneration.

---

## 9. Related

* `plans/done/ISSUE-74-EDIT-LOGIC-DIALOG-PLAN.md` — the dialog this touches.
* `plans/RULES_AND_BRANCHING_PLAN.md`, `plans/RULES_SIMPLIFICATION_PLAN.md` — where the badges and
  `jump-reach.ts` came from.
* Issue #72 (rules & branching), #76 (its merge).
