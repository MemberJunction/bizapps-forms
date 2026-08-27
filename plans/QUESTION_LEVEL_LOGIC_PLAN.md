# Question-Level Logic Plan — two rules, one "Go to"

**Status: ALL PHASES COMPLETE**, with a correction — Phase 2 step 2 (server validation) was
never actually done and shipped broken; see the note in §4. Phase 1 `ff84141` · Phase 2
`6b46eb1` · Phases 3–4 `dda2677`-era.
Final baseline: **1,971** tests (296 / 26 / 142 / 1006 / 501), widget 1199.1 kB, six gates green.

**Phases 3 and 4 shipped together, deliberately.** "Several rules per item" with no UI to author
them is dead capability, and the If/Then dialog IS the multi-rule UI. Splitting them would have
produced one commit that changed nothing an author could see and another that could not be
reviewed without it.

**One thing the plan did not anticipate.** §6 assumed the dialog would keep the per-verb card
picker and gain an If/Then body. It does not: the picker is gone entirely, replaced by ONE
"Edit logic" dialog per item holding the show gate and every jump rule together. The picker
existed because logic was authored a verb at a time, which is exactly what made "what does this
question do?" unanswerable without opening two dialogs.

**One boundary moved.** Phase 1 step 5 said to delete `resolveDisqualification` and
`isArmedKnockout`. It does not: both have live callers in the widget and the server, so deleting
them here would leave the tree broken between two commits. They go in **Phase 2**, in the same
commit that swaps those callers onto `resolveTermination` — which also keeps Phase 1 purely
additive and independently revertible.

Follows `RULES_SIMPLIFICATION_PLAN.md` (complete, `dda2677`). Branch:
`feat/rules-and-branching` → PR #72, or a fresh branch off `next` if #72 has merged by then.

Baseline to beat: **1,944** tests (272 entities / 26 core-entities-server / 142 actions /
1003 ng / 501 server), widget 1197.6 kB, six CI gates green.

---

## §0 User decisions, 2026-08-26 (recorded verbatim — do not re-litigate)

After testing the simplified rules and seeing a competitor's logic editor, the user chose:

1. **Jump targets — question, section, ending screen, or Submit.** Page jump STAYS; question,
   ending and Submit targets are added beside it.
2. **Several rules per item, first match wins.**
3. **Rebuild the rule dialog as If/Then**, matching the reference screenshot: a titled
   "Edit logic for ⟨item⟩", an If block with the and/or connector BETWEEN condition rows, a Then
   row, "All other cases go to", Delete rule / + Add rule, "See all rules" linking to the Rules
   tab, and Delete all rules. *(As built: "See all rules" is obsolete and "All other cases go to"
   shipped as a read-only line rather than a control — §6 has the status of each.)*
4. **Disqualify and "jump to an ending" are the same thing — combine them.** *"we can combine in
   jump to rule where user simplify points the end screen or submit. So identify those things
   and combine them and make it easy as possible."* Disqualification stops being a RULE and
   becomes a PROPERTY of an ending screen; the only branching rule is **Go to**.

**Method**: `/tdd` per phase — vertical slices, RED before GREEN, paste the failing output into
your notes before implementing. Every behaviour gets a happy, an edge and a worst case.

---

## §1 Verified current state (2026-08-26, checked against the working tree)

Rely on these without re-deriving; if a grep disagrees, **stop and reconcile** — the tree moved.

### The jump contract today
- `ConditionalJumpRule` (`conditional-rule.ts:111`) is `{ when: ConditionalGroup; toPageId: string }`.
  `ConditionalRule.jump` is `ConditionalJumpRule[]`, capped by `MAX_JUMP_RULES`.
- **The contract does not restrict jump to pages.** `ConditionalRule` is the same type on all
  four entities, so a question could carry a `jump` today. What stops it is (a)
  `QUESTION_RULE_CARDS` not offering the card and (b) `resolveVisiblePages` being the only
  reader. **The work is the resolver and the UI, not the storage.**
- No migration anywhere in this plan: everything lives in JSON columns, and
  `FormScreen.IsDisqualification` already exists as a column (added `V202608252340`).

### The page-jump resolver — copy its shape, do not fight it
`resolveVisiblePages` (`rule-verbs.ts:41–63`) is a forward fold with a `skipUntilId` marker:
walk pages in display order; while skipping, drop everything until the target id; a visible
page's first forward-pointing fired jump sets the next marker. `firedJumpTarget` (`:67–86`)
refuses `targetIndex <= pageIndex`, so unknown / self / backward targets are **inert, never an
error** — which is what makes jump cycles unrepresentable. **Preserve that property exactly.**

### What reads visibility, and why they must agree
- `resolveVisibleQuestions` (`rule-verbs.ts:100–114`) = visible pages × question show rules ×
  answerable types. Its header states the invariant: the widget renders this set, submits
  exactly it, and the server scores over it.
- The widget iterates to a **fixed point** (`form-runtime.ts`, `MAX_VISIBILITY_PASSES = 5`)
  under "restrict the answers to this set, then re-derive", so the server's single pass
  reproduces it. `isNotAnswered` makes visibility non-monotone, which is why it is capped rather
  than looped. **Question jumps make more rules answer-dependent; the cap and its warning stay.**
- Server: `validation.service.ts:154` iterates `resolveVisiblePages` and drops answers to
  questions that resolve hidden.

### Disqualification today — the entanglement decision 4 removes
- `resolveDisqualification` + `isArmedKnockout` (`rule-verbs.ts`): an ending screen flagged
  `IsDisqualification` whose OWN `show` group has at least one leaf condition. Called from
  `mj-form.component.ts:396` (widget) and `submit-pipeline.ts:337` (server).
- **The trap:** the screen's `show` group means two different things depending on the flag —
  "which thank-you page at the end" when off, "who gets screened out mid-form" when on. That is
  why `ENDING_RULE_CARDS` carries `excludes: ['disqualify']` / `excludes: ['show']`: offering
  both would silently reinterpret a group the author had already written.
- `isArmedKnockout` exists only because of this: `evaluateGroup({})` is vacuously true, which is
  right for `show` and catastrophic for a knockout ("disqualify everyone before they answer").
  **Decoupling the flag from the group deletes the whole guard.**
- `Disqualified` is deliberately NOT `Complete`: terminal and non-resumable, but **no quota, no
  `OnComplete` automations, no `SubmittedAt`** — `response-status.ts` holds the one exhaustive
  mapped type all three call sites read. **This stays exactly as it is.**

### Ending selection today — "All other cases go to" already exists
`resolveEndingScreen` (`form-screens.ts:31–51`): disqualification screens are excluded; the
first non-disqualification ending whose `conditionalRule` MATCHES wins; otherwise the one marked
`isDefault`, else the first with no rule. **The reference screenshot's "All other cases go to" IS
this default ending.** Phase 4 surfaces it in the dialog; it does not invent it.

**Outcome 2026-08-27:** surfaced as a SENTENCE, not a picker — see the "All other cases go to"
bullet in §6 for why the control was built and then removed. Note also what this paragraph
already implies and §6 spells out: a *conditional* ending beats the default, so copy that says
"lands here unless a rule sends them elsewhere" must also allow for an ending's own condition
claiming them first.

### Builder surfaces
- Card sets: `QUESTION_RULE_CARDS` = [show]; `PAGE_RULE_CARDS` = [show, jump];
  `ENDING_RULE_CARDS` = [show, disqualify] (`rules-panel-model.ts`).
- `jumpRule()` reads `rule.jump[0]` only — the schema stores a list, the panel authors one.
  **Decision 2 is mostly UI work on top of storage that already allows it.**
- `RuleVerb` = `keyof ConditionalRule | 'disqualify'`; `RuleFlags.disqualification` and the
  panel's `disqualifyChange` output exist ONLY for the pseudo-verb. Decision 4 removes all three.
- The dialog is `RuleEditorDialogComponent` (chrome only, body projected) driven by
  `RulesPanelComponent`'s draft/commit state (`RuleDraft`, `isDraftCommittable`, `isDraftDirty`).
- The Rules tab (`rules-tab.component.ts` + `rules-inventory.ts`) is a VIEW with no write path;
  `rules-hub.wiring.spec.ts` pins that. **Keep it true.**

---

## §2 Target model — two rules, and the destination decides the meaning

| Rule | Set on | What it does |
|---|---|---|
| **Show only if** | question · section · ending | The item is hidden unless the conditions match |
| **Go to** | question · section | When the conditions match, go to a later question, a later section, an ending screen, or Submit |

**Disqualify is no longer a rule.** It is a toggle on an ending screen — *"Mark responses that
reach this screen as disqualified."* Any route to that screen yields `Disqualified`; every other
ending yields `Complete`. The rule says where to go; the screen says what arriving there means.

That is the whole of decision 4, and it deletes rather than adds:

- `resolveDisqualification` and `isArmedKnockout` — **gone**. There is no group on the screen
  doing knockout duty, so there is nothing to arm and no empty-group catastrophe to guard.
- The `disqualify` pseudo-verb, `RuleFlags`, `disqualifyChange`, and the `excludes` machinery on
  `RuleCardSpec` — **gone**. An ending's `show` group now means exactly one thing.
- `ENDING_RULE_CARDS` becomes `[show]`.

### The jump target becomes a tagged reference

```ts
export type JumpTargetKind = 'question' | 'page' | 'ending' | 'submit';
export type JumpTarget =
  | { kind: 'question' | 'page' | 'ending'; id: string }
  | { kind: 'submit' };
export interface ConditionalJumpRule { when: ConditionalGroup; target: JumpTarget; }
```

**Legacy `{ when, toPageId }` normalizes at the parse boundary** to
`{ kind: 'page', id: toPageId }` — one shape inside, tolerance only at the edge. Nothing shipped
uses jump (`grep '"jump"' migrations/ metadata/` is empty), but dev databases hold hand-authored
page jumps and a published snapshot is a frozen blob no migration rewrites.

| Target | Meaning | Terminal? | Status |
|---|---|---|---|
| `question` | Hide every question between here and it | no | — |
| `page` | Hide every page between here and it (today's behaviour, unchanged) | no | — |
| `ending` | Finish now, show that screen | **yes** | that screen's flag |
| `submit` | Finish now, let `resolveEndingScreen` pick the screen | **yes** | `Complete` |

`submit` earns its place next to `ending`: it means "stop asking, they're done", leaving the
ending to the conditional/default logic that already exists — which is what an author wants when
several endings compete on score.

### Forward-only, still

A non-terminal target at or before the current position is **inert** — skipped, never an error —
exactly as `firedJumpTarget` does today. This is what keeps cycles unrepresentable, and why the
resolver stays a single forward fold instead of a graph walk. Terminal targets have no ordering
to violate.

### Migrating the user's dev data

An ending screen currently flagged `IsDisqualification` with a `show` group will, after this
change, keep its flag and have a group nothing reads (`resolveEndingScreen` already excludes
disqualification screens). It stops screening anyone, silently. Nothing is shipped, so this is
dev data only — but **the Rules tab must flag it**: an ending marked disqualified that no `Go to`
rule targets gets a broken-rule row saying nothing sends anyone there. That reuses the badge
built in `RULES_SIMPLIFICATION_PLAN` Phase 3 and turns a silent regression into a visible one.

---

## §3 Phase 1 — the contract and the resolvers (`forms-entities`)

**RED first**, in `rule-verbs.spec.ts` and a new `jump-targets.spec.ts`.

1. **`JumpTarget` + normalization.** Add the types; teach the jump schema to accept either shape
   and emit the tagged one; `parseConditionalRule` returns only tagged targets. Legacy
   `toPageId` round-trips to `{kind:'page'}`; a rule carrying BOTH shapes is a parse error, not
   a silent winner.
2. **One flow resolver.** Replace the two independent folds with a single forward walk over
   pages × questions honouring page show, question show, and every jump kind.
   `resolveVisiblePages` and `resolveVisibleQuestions` keep their signatures and become thin
   readers of it — every existing caller keeps working, and the two cannot disagree because
   there is one fold.
3. **Empty pages disappear.** A page whose every question was jumped over must not render as a
   bare header. A page is visible iff it survives its own show rule AND (it still has a visible
   question OR it never had an answerable one — a Statement-only page is legitimate).
4. **`resolveTermination(pages, answers, extras)`** → `{ kind: 'ending', screenId } | { kind:
   'submit' } | undefined`. Walks visible questions in order; the first fired terminal jump wins.
   Replaces `resolveDisqualification` at both call sites.
5. **Delete `resolveDisqualification` and `isArmedKnockout`.** Retarget their specs onto
   `resolveTermination` — the knockout behaviours they proved still exist, reached differently.

**Zero-checks** (must return nothing outside the parser and its spec):
```bash
grep -rn "toPageId" packages/ --include='*.ts' | grep -v node_modules | grep -v dist \
  | grep -v 'schemas.ts' | grep -v 'legacy' | grep -v '\.spec\.ts'
grep -rn "resolveDisqualification\|isArmedKnockout\|'disqualify'" packages/ --include='*.ts' \
  | grep -v node_modules | grep -v dist | grep -v '\.spec\.ts'
```

## §4 Phase 2 — enforcement (widget + server)

The resolvers are shared; this phase is about the two consumers agreeing.

1. **Widget.** Confirm question jumps settle inside `MAX_VISIBILITY_PASSES` and the warning still
   fires for a form whose rules do not settle. `mj-form.component.ts` swaps its disqualification
   branch for `resolveTermination`: submit what we have, show the resolved screen, and take the
   status from that screen's flag.
2. **Server.** `submit-pipeline.ts` resolves termination on the same `preliminaryMap`
   disqualification used. `validation.service.ts` drops answers the flow skipped — it already
   drops hidden ones, and the one fold makes that free.
3. **`response-status.ts`** keeps its exhaustive mapped type; the terminal-ending path
   classifies from the screen flag rather than from a separate resolver.

**Worst case to prove:** a question jump that hides a REQUIRED question. The server must not
reject a submission naming a field the respondent never saw — the unrecoverable anonymous-path
failure the fixed point exists to prevent.

**Second worst:** an ending jump must fire quota and `OnComplete` automations exactly once, and
a disqualified one must fire neither. That is the behavioural heart of decision 4.

> **Step 2 was not done, and the worst case above was live in production until 2026-08-26.**
> `validation.service.ts` kept iterating `resolveVisiblePages` and re-filtering each page's own
> question list on its `show` rule — which drops a skipped PAGE (so the page-jump specs passed)
> and silently restores every question a QUESTION-level jump skipped. The plan was marked ALL
> PHASES COMPLETE with this open, and no spec covered the case: `rule-verbs-validation.spec.ts`
> tested page jumps only. Found by a user testing `Go to → Submit` on a form whose next question
> was required, and reported as "the rule took me to Submit but Submit says Last Name is
> required."
>
> Fixed by iterating `resolveRenderedQuestions` — which this repo had exported, documented and
> never called from anywhere. Three lessons worth keeping: a resolver with **zero callers** is
> the strongest possible signal that the step which was meant to call it did not happen; a plan
> step that says "it already does X, so this is free" is the one to verify rather than tick; and
> a spec suite that covers the easy half of a generalisation (pages) will pass while the hard
> half (questions) is broken. Two more consumers were derived from pages the same way and had to
> move with it — the widget's scroll renderer, and the page-jump firing position (§Phase 1's
> forward walk fired a page's `Go to` on ARRIVAL, so a section rule reading its own section
> skipped the question that triggered it and the fixed point never settled).


## §5 Phase 3 — several rules per item

`jumpRule()` reads `rule.jump[0]`; the panel authors one. Lift both to the list the contract
already stores: first match wins, `MAX_JUMP_RULES` enforced in the editor (currently unenforced
in the UI — `MAX_CONDITIONS_PER_GROUP` is, `MAX_JUMP_RULES` is not).

Ordering is meaning here: rule 1 beating rule 2 is the whole semantics, so **author order, shown
as numbers, with move up/down**. A drag surface is not worth it for a handful of rules.

## §6 Phase 4 — the If/Then dialog

Rebuild the dialog body per decision 3. `RuleEditorDialogComponent` is chrome-only and keeps its
draft/commit and discard-warning behaviour — that work is done and must not regress.

- **If block**: condition rows with the and/or connector BETWEEN them. Our contract has one
  combinator per group, so the connector is one control rendered repeatedly, and changing any
  one changes them all — say so in a tooltip rather than pretending they are independent, which
  would need nested groups the contract does not have.
- **Then row**: `Go to` + a target picker grouped by kind (Questions · Sections · Endings ·
  Submit), offering only forward targets. Reuse the stale-entry idiom — a `<select>` whose value
  is not among its options renders BLANK.
- **All other cases go to**: reads and writes the default ending screen's `isDefault`. A
  form-level fact edited from an item-level dialog, so it needs an explicit note in the UI; it is
  the one write here that touches something other than the item.
  **STATUS 2026-08-27 — SUPERSEDED. Shipped as a read-only line, deliberately NOT a picker.**
  Do not "finish" this bullet by building the control; it was built, reviewed and removed.

  The dialog now states the catch-all — *"Everyone who finishes lands on **X**, unless a rule
  sends them elsewhere"* — and offers no way to change it. What this bullet asked for was built
  first (a `<select>` writing `IsDefault` through the draft) and rejected in review for the
  reason the bullet itself names: it is form-level state on an item-level dialog. Every
  question's dialog carried it, so it needed a caption reading *"this is a form-wide setting —
  changing it here changes it for every question."* A control that needs that caption has
  already failed. The catch-all is authored in exactly one place, the Default toggle on the
  Endings strip, made genuinely exclusive in v0.12 (`UQ_FormScreen_OneDefaultEndingPerForm`).

  Note for anyone tempted to route this through the Then row instead: **a jump rule cannot
  express the catch-all.** A jump needs a condition, and `ruleFromLogicDraft` drops a
  conditionless row on purpose, because `evaluateGroup({})` is vacuously true — such a row would
  fire for everyone and swallow every rule after it. "Then go to → an ending" and "the default
  ending" are different things and neither substitutes for the other.
- **See all rules** → the Rules tab. **Delete rule** / **+ Add rule** / **Delete all rules**,
  the last behind a confirm.
  **STATUS 2026-08-27.** **See all rules is OBSOLETE** — the Rules tab was deleted in `d4b31c0`
  and every rule an item carries is now a badge on that item, with the hub's own sentences as its
  tooltip, so there is no longer a destination for the link and nothing for it to say. **Delete
  rule** and **+ Add rule** shipped in `f1f03df`. **Delete all rules, behind a confirm, is NOT
  built** — removing several rules means removing them one at a time. Minor, and unscheduled.
- **The ending screen's settings** gain the disqualified toggle with copy that says what it
  means: *"Responses that reach this screen are recorded as disqualified — they don't count
  toward your response limit and no automations run."*
- Sentence prose lives in `describeCondition` / `rules-inventory.ts` — **extend, never
  duplicate.** The Rules tab must read back exactly what the dialog offered, including the new
  targets ("…then go to Submit", "…then go to \"Not eligible\"").

## §7 Test matrix (happy / edge / worst)

| Behaviour | Happy | Edge | Worst |
|---|---|---|---|
| Legacy `toPageId` | normalizes to `{kind:'page'}` | round-trips through serialize | a rule with BOTH shapes is a parse error, not a silent winner |
| Question jump | skips the questions between | target on a later page skips those pages too | backward / self / unknown → inert, form still renders |
| Empty page | page with all questions skipped disappears | Statement-only page still renders | page show rule and question jump disagree → question set wins |
| Ending jump | terminates, shows that screen | screen flagged disqualified → `Disqualified`, no quota, no automations | unflagged screen → `Complete`, quota and automations fire exactly once |
| Submit target | terminates, `resolveEndingScreen` picks | competing conditional endings still resolve by score | no default ending exists → still completes, no crash |
| Several rules | first match wins | rule 2 fires when rule 1's group fails | over `MAX_JUMP_RULES` → editor refuses, parser rejects |
| Fixed point | question-jump chain settles | `isNotAnswered` reveal-on-clear still settles | non-convergent form → capped at 5 + warning (existing tests stay green) |
| Required + jump | skipped required question is not enforced | server drops its answer | server never rejects naming a field never shown |
| Orphaned knockout | — | ending flagged disqualified WITH a Go-to pointing at it is healthy | flagged with NOTHING pointing at it → flagged in the Rules tab |
| Dialog | author → Save → persisted | close clean → silent | close dirty → discard warning (Phase 0 behaviour must not regress) |

## §8 Operating rules

**8.1** `/tdd` per phase; paste RED output before implementing. No `any`, no `.Get()`/`.Set()`;
derive types, never restate a union. Never edit `packages/*/src/generated/**`. Tokens only in CSS.

**8.2 Traps this branch has hit.** Prefer the Edit tool over regex splices (two files were
mangled). Angular `@if`/`@for` brace imbalance = NG5002 — build after every template edit. A
`<select>` whose `[value]` is absent from its options renders BLANK. Wiring specs must strip
comments, and a wiring spec written AFTER its component must be proved by mutating the source.
Vitest here is colocated `.spec.ts`.

**8.3 Gate battery — before every commit, record the numbers:**
```bash
pnpm run build:packages     # TURBO_FORCE=1 if suspicious
npm test                    # baseline 1,944; changed counts must be explainable
npm run lint:ui             # 0 violations
npm run lint:distribution && npm run lint:distribution:mutants
```

**8.4 CI.** Six checks on the PR. A "failed" run showing `steps: []` and ~11s duration is runner
starvation, not the code — rerun it. `changes_and_migrations` needs the changeset to exist; this
plan ships no migration, so the existing changeset's prose is what gets updated.

**8.5 Done.** All phases pushed; gates green with numbers; `FORMS_BUILD_PLAN.md` §12 has one
entry per phase; manual pass at `:4201` covering the §7 worst cases, plus a respondent run
proving a question jump, a disqualifying ending jump and a `Complete` ending jump end-to-end.

---

## 9. Post-Phase-5 defect: upload state outlived its question

**Found by testing, not by the plan.** Reported as "it doesn't upload two different files" on a
form carrying a FileUpload at the same position in two sections. Diagnosed live at
`http://localhost:4000/f/<slug>` — note that `/f/:slug` is served by the **API** origin, not
Explorer, which `core/mj-api-origin.ts` already warns about.

**Two wrong guesses recorded, because both are easy to make again.** First: that section stepping
*unmounts* questions and therefore LOSES the upload confirmation. It does not — `@if (current();
as page)` never goes falsy, so Angular re-binds the view instead of rebuilding it. Second, after
seeing the confirmation survive: that this made the state harmless. The opposite. `@for` tracked
on `$index`, so the component was recycled onto a different question and carried six private
fields with it. Proven by stamping `data-stamp` on each `mjf-form-question` host, pressing Back,
and finding the same node rendering another section's question.

**Fix.** `core/upload-store.ts` — upload lifecycle keyed by question id, provided once per widget.
Not a `BaseSingleton`: several forms can be embedded on one host page. `@for` tracks on
`entryKey`. The supersede/clear rules moved out of the component and are unit-tested directly
rather than by regex over component source.

**What this cost the plan's own claims.** §7's manual pass never covered two file questions,
which is why five phases of testing missed it. Any future render-mode change should re-run the
upload case in BOTH modes — OneQuestion shares one component instance across the entire deck, so
it is the more exposed of the two and remains unverified live (no published OneQuestion
distribution carries a file question).


---

## 10. The other half of §9: an upload's ANSWER was routed by the view

**Found by code review, in the exact place §9 said to look.** §9 closed with "OneQuestion shares
one component instance across the entire deck, so it is the more exposed of the two and remains
unverified live". It was right, and the store fixed only half of what was wrong there.

**What §9's fix did and did not cover.** `FormUploadStore` keyed the upload *confirmation* by
question id, so the display could no longer bleed. The *answer* still travelled a different road:
`FormQuestionComponent.uploadFile` awaited the upload and then called `this.valueChange.emit(fileId)`.
An `output()` is routed by the VIEW — `(valueChange)="onValueChange(q, $event)"` writes to whichever
question the template is bound to at the moment it fires — and after an `await` that is not reliably
the question the upload was for:

- **OneQuestion — silent corruption.** `@if (current(); as q)` re-binds rather than rebuilds, so one
  `mjf-form-question` serves the whole deck. A respondent who picks a file for an optional question
  and presses Next before the upload lands has the resume's file id written as the NEXT question's
  answer, overwriting whatever they had put there. Nothing reports it; both questions read plausibly.
- **Scroll — silent loss.** Leaving a section destroys the component (the `entryKey` fix means the
  views really are rebuilt), and an emit from a destroyed `output()` is dropped. The store still
  shows "resume.pdf uploaded" while the answer was never stored — the display/answer divergence the
  store was built to end, arriving through the other door.

**Fix.** The store commits the answer itself, under the token's own question id, so the view is not
on the path at all: `succeed(token, fileId)` / `fail(token, message)` / `clear(questionId)` write
through an `UploadAnswerSink` (`FormRuntime` satisfies it structurally), and `begin` clears the
question while its upload is in flight. The component no longer emits from the upload path. The
supersede guard and the answer write became ONE decision instead of two that had to agree — the
booleans `succeed`/`fail` used to return, which the caller had to remember to check, are gone.

**Why this was invisible.** Both halves are Angular view semantics, and this suite is node-only —
no TestBed, no DOM. §9's fix was verified live in Scroll mode, where the corruption does not occur.
Committing through a plain class is what made it testable at all: `upload-store.spec.ts` now drives
a real `FormRuntime` and asserts the answer lands on the right question.

**Still unverified live:** OneQuestion mode with a file question, in either direction. No published
OneQuestion distribution carries one. That has now been the outstanding item twice.
