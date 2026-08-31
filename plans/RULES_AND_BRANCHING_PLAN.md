# Rules & Branching Plan — verbs, not just visibility

> **PARTLY SUPERSEDED, 2026-08-26** by [`RULES_SIMPLIFICATION_PLAN.md`](RULES_SIMPLIFICATION_PLAN.md).
> The **C1 `require` verb was removed**, along with four operators this plan's Phase A3 shipped
> (`equalsIgnoreCase`, `contains`, `startsWith`, `endsWith`). The evaluators, `jump`,
> disqualification and scoring all stand. Read C1 and the A3 operator notes below as history:
> they record what was built and why, not what the code does now.

**Status: IMPLEMENTED (Phases A, B, C) on `feat/rules-and-branching`, 2026-08-25.** Written and
verified against the working tree the same day. All phase tasks below are checked off with
implementation notes; §7's open decisions are resolved inline. Phase D remains backlog.
Full suite green after each phase (Entities 262+ / ng 831+ / server 464+ / actions 142);
migration `V202608252340__v0.12.x__Rules_And_Branching.sql` applied + CodeGen run;
`lint:distribution` passing.

Branch model per repo rules: cut `feat/rules-and-branching` from `next`, PR → `next`. Phases A and
B/C should be **separate PRs** (A is fixes to existing behavior; B/C are new capability — per the
design principle that refactor/fix and behavior-add stay independently revertible).

---

## 1. What was verified (2026-08-25)

Every factual claim driving this plan was checked against the code. Corrections are marked ⚠ —
do not trust the earlier chat analysis where it disagrees with this table.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| V1 | Comparison value is a raw text input; a typo silently kills the rule forever | ✅ | `conditional-rule-editor.component.html:65` (`type="text"`); `scalarsEqual` is strict `===` (`conditional-rule.ts`) |
| V2 | `ConditionalSourceQuestion` is `{id, prompt}`; both getters iterate `QuestionNode`, which already carries `options` | ✅ | `conditional-rule-editor.component.ts:29-32`; `form-builder.component.ts:758` (questions) and `:646` (endings); `builder-models.ts:17-20` |
| V3 | `greaterThan`/`lessThan` on a Date question can never fire | ✅ **defect** | `toNumber` at `conditional-rule.ts:239` (⚠ not :213); `Number('2026-08-25')` → `NaN` confirmed live; date answers are strings (`answer-value.ts:83-84`) |
| V4 | Operators are a closed set of 8; adding one = one switch arm + one editor row, compiler-guarded | ✅ | `conditional-rule.ts:18-26`, `assertNever` at `:269`; editor `OPERATORS` at `conditional-rule-editor.component.ts:41` |
| V5 | `FormPage.ConditionalRule` is parsed, published, evaluated on both sides — but unauthorable: pages cannot be selected | ✅ | parse `snapshot-builder.ts:162`; client `form-runtime.ts:95`; server `validation.service.ts:152`; `BuilderSelection` = `question\|screen\|none` (`builder-selection.ts:17-20`) |
| V6 | FORMS_BUILD_PLAN claims "skip-to-page" ships in Phase 1 | ✅ plan/code gap | `FORMS_BUILD_PLAN.md:531-532`; no jump target exists anywhere in the code |
| V7 | Endings resolve only at submit — no mid-form disqualification | ✅ | widget `mj-form.component.ts:480` (on submit success); server `submit-pipeline.ts:208` |
| V8 | `isRequired` is a static boolean on the published question, enforced client + server | ✅ | `form-definition.ts:107`; `validation.ts:64`; `validation.service.ts` (isRequiredSatisfied) |
| V9 | "`FormQuestionOption.Score` already exists" | ⚠ **FALSE** | `Score`/`ScoreRationale` live on **FormResponseAnswer** (`B202606281200…sql:218`, per-answer grading). **`FormQuestion.ScoringConfig`** is the relevant column — nvarchar(MAX) JSON, documented "numeric weights; null when unscored", and **dead**: only `form-clone.service.ts:234` touches it |
| V10 | Answers are keyed by questionId (repeating sections would need an index dimension) | ✅ | `form-runtime.ts:25` `Map<string, AnswerValue>` |
| V11 | Quota is form-wide only; no per-option capacity | ✅ | `form-definition.ts:56`; `quota.service.ts` |
| V12 | `FormResponse.Status` allows `('Partial','Complete')` — no disqualified state | ✅ | `B202606281200…sql:201` CHECK constraint |
| V13 | `FormScreen.ScreenType` CHECK is `('Welcome','Ending')`; endings deliberately unconstrained in count; screens already carry `ConditionalRule` + `IsDefault` + `RedirectURL` | ✅ | `V202608182100…sql:87-112` |
| V14 | Right panel renders `mjf-screen-editor` or `mjf-question-editor`; rules live in collapsible `mjf-setting-row`s; a "+ Add a conditional ending" card-button pattern already exists | ✅ | `form-builder.component.html:473-491`, `:464-467`; `setting-row.component.ts:111` |
| V15 | Widget navigation: scroll mode renders all visible pages; one-question mode is pure cursor math over **visible questions** (not pages) that re-clamps as rules fire | ✅ | `mj-form.component.html:99-109`; `one-question-stepper.ts` |

**Design consequence of V15:** the widget has no page-cursor to "jump". Therefore **jump-to-page
compiles to visibility**: "on page P, if X, go to page T" ≡ "pages strictly between P and T are
hidden when X". This keeps the evaluator pure, reuses `visiblePages`, and the server's existing
hidden-page drop (`validation.service.ts:152`) enforces it with **zero new server code paths**.
Forward-only jumps make cycles unrepresentable — no cycle detector needed.

---

## 2. Design — one rule object, many verbs (functional core)

### 2.1 Schema evolution of the `ConditionalRule` JSON (no migration needed for rules)

`ConditionalRule` columns already exist on FormQuestion, FormPage, FormScreen as nvarchar(MAX)
JSON. Extend the **contract**, not the schema:

```jsonc
// FormQuestion.ConditionalRule
{
  "show":    { "all": [ { "questionId": "…", "op": "equals", "value": "Other" } ] },
  "require": { "any": [ { "questionId": "…", "op": "equals", "value": "Other" } ] }
}

// FormPage.ConditionalRule
{
  "show": { /* existing */ },
  "jump": [ { "when": { "all": [ … ] }, "toPageId": "…" } ]   // forward-only, first match wins
}

// FormScreen.ConditionalRule — unchanged shape; disqualify is a screen flag, not a rule verb
```

Absent keys mean today's behavior exactly — every already-published snapshot stays valid, and
`parseConditionalRule` (which returns the object whole) forwards unknown keys untouched, so old
servers ignore new verbs instead of erroring. **State this as a tested invariant.**

Conditions gain one variant for scoring, discriminated and backward-compatible:

```jsonc
{ "questionId": "…", "op": "equals", "value": "x" }        // existing — source implied
{ "source": "score", "op": "greaterThan", "value": 70 }     // new — reads the running score
```

### 2.2 New pure functions — all in `packages/Entities/src/contracts/`, shared client + server

This is the FP discipline the repo already practices (`conditional-rule.ts` is the model: pure,
framework-free, one source of truth both sides import — see its own header comment). Every new
verb is a **total, pure function**: no I/O, no throw on untrusted input, same inputs → same output.

| Function | Signature (shape) | Semantics |
|---|---|---|
| `isRequiredNow` | `(isRequired, rule, answers) => boolean` | `isRequired \|\| (rule.require ? evaluateGroup(rule.require, answers) : false)`. Static true = always required (the toggle stays the stronger promise). |
| `computeScore` | `(questions, answers) => number` | Fold over answered questions: `ScoringConfig.points[optionValue]` summed; multi-select sums selected options; non-finite points contribute 0. Total function — malformed config scores 0, never NaN. |
| `resolveVisiblePages` | `(pages, answers) => PublishedFormPage[]` | Single forward fold: a page hidden by `show` is dropped (existing); a fired `jump` (first matching rule wins) drops every page before its target. A backward/unknown/self `toPageId` is **ignored** (log-worthy at authoring time, inert at runtime). Replaces the bare filter at `form-runtime.ts:92-96` and the page loop at `validation.service.ts:151-153` — one function, two callers, exactly like `evaluateConditionalRule` today. |
| `resolveDisqualification` | `(screens, answers) => PublishedFormScreen \| undefined` | First screen (display order) with `isDisqualification` whose rule fires. Mirrors `resolveEndingScreen`'s first-match-wins so the two never disagree on ordering semantics. |
| `evaluateCondition` (extended) | — | New arm for `source: 'score'`: the evaluator takes score via the answers map under a reserved key OR an explicit context param — **decide at implementation: prefer an explicit `EvalContext {answers, score}` param added with a default**, keeping the map free of magic keys. |

**Stated invariants (each gets a spec):**
1. Absent rule / absent verb ⇒ today's behavior, byte-for-byte.
2. **Hidden dominates required**: a question invisible by `show` is never required, whatever
   `require` says (already structurally true server-side — `validation.service.ts:174` returns
   before the required check; keep it true and test it).
3. Jumps are forward-only; anything else is inert, never an exception.
4. Disqualification is monotone within a submit: evaluated on current answers only, no history.
5. Every evaluator is total over untrusted snapshot JSON (the GraphQL mutation is reachable
   directly — same posture as `isFormQuestionType`'s prototype-chain guard).

### 2.3 Schema changes that DO need migrations (+ CodeGen)

One migration file (`V…__v0.12.x__Rules_And_Branching.sql`), per repo migration rules
(hardcoded UUIDs, extended properties on every business column, `${flyway:defaultSchema}`,
no `__mj_*` timestamps, no FK indexes):

1. `FormScreen.IsDisqualification BIT NOT NULL DEFAULT 0` — a disqualify screen **is** an
   Ending (keeps every endings code path — `resolveEndingScreen`, screen strip, screen editor —
   working unmodified); the flag only adds "may fire mid-form and blocks completion".
   `ScreenType` CHECK stays `('Welcome','Ending')` (V13) — deliberately unchanged.
2. `FormResponse` Status CHECK → `('Partial','Complete','Disqualified')` (V12).
3. Extended properties documenting both.

Then: `npm run mj:codegen`, **write no TypeScript against the new columns until it runs**
(critical rule 2b), commit any changed `metadata/` JSON without a `Metadata_Sync.sql` (that is release work), and run
`npm run lint:distribution` before the PR.

`ScoringConfig` needs **no** migration — the column exists (V9); this plan finally reads it.

---

## 3. Builder UX — the Rules panel (right pane, + button, card picker)

**This is a product requirement, not an implementation suggestion:** rules and branching are
authored in the **right-side properties panel**. A **"+ Add rule" button** opens a **card
picker**; the author selects a card (one card per verb); the selected card opens as an editable
rule card where the conditions are set.

Concretely, in the pane at `form-builder.component.html:473` (aside `fb-pane--right`):

1. **New `mjf-rules-panel` component** replacing the single "Show only if" `mjf-setting-row` in
   `question-editor.component.html:121` and `screen-editor.component.ts:192`. It renders:
   - The list of **existing rule cards** for the selected item (each card: verb icon + title,
     human-readable summary line — "Show only if *Ticket type* equals *VIP*" — expand to edit,
     ✕ to remove).
   - The **"+ Add rule"** button. Clicking it opens the **card picker**: a small grid of verb
     cards (Font Awesome icon, name, one-line description), filtered to what the selected item
     supports:

   | Selected item | Cards offered |
   |---|---|
   | Question | **Show only if** · **Require if** |
   | Page | **Show only if** · **Jump to page** |
   | Ending screen | **Show only if** (existing conditional ending) · **Disqualify if** |

   Picking a card appends a rule card with an empty condition group and focuses it.
2. **Inside every card, reuse `mjf-conditional-rule-editor`** as the condition-group editor —
   one editor, N verbs, exactly the deep-module move. "Jump to page" adds one `<select>` of
   later pages; "Disqualify if" is the screen's existing rule editor plus the flag.
3. **Page selection** (the missing half of V5): extend `BuilderSelection` with
   `{kind:'page'; id}`, make page headers in the left tree selectable, add a
   `mjf-page-editor` (title + Rules panel) as a third branch in the right pane. This alone
   ships the engine that already exists on both sides.
4. All styling via `--mj-*` tokens (no hardcoded colors), `@if`/`@for`, standalone components,
   `ChangeDetectionStrategy.OnPush`, the `mjf-setting-row`/`FORMS_UI_CSS` idiom already in the
   package. Persistence stays the existing debounced entity-save path
   (`onQuestionChanged`/`onScreenChanged`) — the panel edits the parsed rule and the parent
   serializes via `json-fields.ts`.

---

## 4. Phases & tasks

### Phase A — make existing rules trustworthy (PR 1; no schema change, no new verbs)

- [x] **A1. Option picker for the comparison value** (the single highest-value fix — it removes
      the #1 documented failure class, config typos). Add `type` + `options: {label,value}[]` to
      `ConditionalSourceQuestion`; populate in the two getters (`form-builder.component.ts:758`,
      `:646`); in the editor, when the selected source question has options, render a `<select>`
      (multi-select checklist for `in`/`notIn`) instead of the text input; keep free text for
      non-option sources. Store option **values**, display **labels**.
- [x] **A2. Fix date comparison** (V3 defect): `toNumber` (`conditional-rule.ts:239`) falls back
      to `Date.parse` for ISO date strings on both sides of the comparison; document why in the
      function comment. Both operands must coerce through the same path.
- [~] **A3. Four operators**: `isNotAnswered` (the inexpressible one), ~~`equalsIgnoreCase`,
      `startsWith`, `endsWith`~~. One arm each in `evaluateCondition` (compiler-enforced via
      `assertNever`), one row each in the editor's `OPERATORS`. **Three of the four removed
      2026-08-26** (with `contains`, which predated this plan) — RULES_SIMPLIFICATION_PLAN §2.
      `isNotAnswered` stands and remains the one that mattered. The others only ever did anything
      on a free-text answer, which is where a rule fires on whether the respondent's spelling
      matched the author's.
- [x] **A4. Correct FORMS_BUILD_PLAN.md:532** — until Phase C lands, §6 must say show/hide only
      (it currently promises skip-to-page that does not exist).

### Phase B — Rules panel UI + page selection (PR 2; UI only, still no new verbs)

- [x] **B1.** `mjf-rules-panel` + card picker as §3; migrate the existing "Show only if" rows
      into it (a question's existing rule appears as one card — no data change).
- [x] **B2.** Page selection: `BuilderSelection` third arm, selectable page headers,
      `mjf-page-editor` with the Rules panel offering **Show only if** (page-level show/hide is
      live end-to-end the moment this ships — V5).

### Phase C — the missing verbs (PR 3+; contract + migration + CodeGen first)

- [x] **C0.** Migration + CodeGen per §2.3. No TS against new columns before CodeGen runs.
- [~] **C1. Require-if**: ~~`require` group in the contract; `isRequiredNow` used at
      `validation.ts:64` (client) and the `question.isRequired` check in
      `validation.service.ts` (server); "Require if" card.~~ **REMOVED 2026-08-26** —
      RULES_SIMPLIFICATION_PLAN Phase 1. Requiredness is the static toggle and only the toggle:
      the verb was a second answer to a question the editor had already asked, it lost silently
      to the toggle when the two disagreed, and neither the asterisk nor `aria-required` ever
      knew about it. Both call sites now read `question.isRequired` directly.
- [x] **C2. Jump to page**: `jump` rules on FormPage; `resolveVisiblePages` replacing both
      page-visibility call sites; authoring UI offers only **later** pages; "Jump to page" card
      (page editor only).
- [x] **C3. Disqualify**: `IsDisqualification` flag + "Disqualify if" card on ending screens;
      widget evaluates `resolveDisqualification` when the respondent FINISHES a question (leaves
      it, or advances past it — never per keystroke, which disqualified someone typing `18` on the
      `1`) and, on first match, submits what it has and shows that ending (its `RedirectURL`
      honored); server re-evaluates on the FINAL submit (client is never trusted — same
      posture as required/validation), sets `Status='Disqualified'`, skips required-checks for
      everything after the disqualifying answer set, and returns the disqualify ending.
- [x] **C4. Scoring**: read `FormQuestion.ScoringConfig` (`{points: Record<optionValue, number>}`);
      `computeScore` shared; `source:'score'` conditions usable in ending-screen rules (bands)
      and page/question rules; builder UI: per-option points inputs on option-carrying
      questions + score sources in the condition editor.

### Phase D — backlog (explicitly out of scope here)

Per-option capacity (event sessions), prefill/known-respondent conditions (the MJ-native
differentiator — bizapps-common Person), repeating sections (needs an answer-key index
dimension — V10 — a different plan). Flow-graph stays out per FORMS_BUILD_PLAN §1.4.

---

## 5. Test plan — happy / edge / worst, per pure function

Vitest, `.spec.ts` colocated (repo convention — **not** `.test.ts`, no `@memberjunction/test-utils`).
The evaluators are pure and framework-free, so every case below is a plain function-call spec —
this is why the verbs live in `contracts/`, not in components. Client/server parity is by
construction (one shared function), and one spec per verb asserts both packages import that
function rather than reimplementing it (the drift `isAnswerSupplied`'s history warns about).

Every new/changed function ships specs in **three named blocks: `happy`, `edge`, `worst`**.

| Function | Happy | Edge | Worst |
|---|---|---|---|
| A1 picker (`valueAsString`/emit) | option selected → rule matches submit-side value | option label ≠ value; option deleted after rule authored (stale value surfaces, rule keeps old value, no crash) | source question deleted → editor renders, rule inert not throwing |
| A2 `toNumber`/`compareNumeric` | `'2026-08-25' > '2026-01-01'` true | equal dates (neither op fires); date vs plain number; `'0'` | garbage string, `''`, mixed date/number operands → `false`, never NaN-poisoned |
| A3 operators | each fires on its obvious case | `isNotAnswered` vs whitespace-only (true — matches `isAnswerSupplied`); `equalsIgnoreCase` with unicode case; `0`/`false` are answers | array answers into string ops → `false`; `startsWith` with empty-string value |
| `isRequiredNow` | require-group fires → required | static `isRequired=true` + failing group → still required; **hidden + require both true → not required (invariant 2)** | malformed `require` (not a group) → falls back to static; unknown questionId in group |
| `resolveVisiblePages` | jump fires → intermediate pages dropped | jump to the very next page (no-op); two rules both firing (first wins); jump on the last page | backward jump, self-jump, unknown `toPageId` → inert; every page hidden → empty list handled by caller; `MAX_JUMP_RULES` cap respected |
| `resolveDisqualification` | matching flag+rule → that screen | two disqualify screens (display order wins); flag without rule → never fires (a rule is what arms it) | malformed rule JSON → not disqualified; disqualify + normal conditional ending both matching → disqualify wins (documented) |
| `computeScore` | points summed across answers | multi-select sums; unanswered contributes 0; option with no points entry = 0 | `points` missing/`null`/non-numeric/`Infinity` → contribute 0, total always finite; `source:'score'` condition on unscored form compares against 0 |
| Compat invariants | pre-plan snapshot JSON → identical visibility/required/ending decisions before vs after | rule with only unknown keys `{"foo":1}` → always visible | fuzz: arbitrary JSON into every parser → never throws (matches `parseObject`'s posture) |

Server-side additions (Vitest in `packages/Server`, alongside `validation.service`'s existing
specs + the `__tests__/fakes.ts` harness): disqualified submit persists `Status='Disqualified'`
with partial answers and passes no required-errors; a client that "forgets" it was disqualified
still gets disqualified server-side; jump-hidden pages' answers are **dropped** (existing
hidden-answer drop covers it — add the test that proves it).

**Two corrections to this section, from the adversarial review — the plan as written was wrong
about WHEN a knockout applies, and both errors reached shipped code before being caught.** A
knockout is judged on a COMMITTED answer, never on every change: a text field emits on every
keystroke, so `age lessThan 18` fired on the `1` of `18`. And it SEALS the response only on a
finished submission, never on an autosave: the debounce catches half-typed values too, and a
sealed row cannot be corrected. Enforcement is unaffected — the final submit is the pass a client
cannot avoid, and it still seals — which is the only thing "ENFORCED server-side" ever needed to
mean.

Caps (design-principles non-negotiable): `MAX_CONDITIONS_PER_GROUP` and `MAX_JUMP_RULES`
constants with explicit over-limit behavior, each with a worst-case spec. **As built this is
REJECT, not truncate** — the planned "truncate + authoring-time warning" was the wrong call and
was not implemented: silently dropping a condition from an `all` group weakens the gate the
author wrote, which is the one direction a rule must never fail. Enforcement, precisely: the
EDITOR stops offering "Add condition" at the cap (`canAddCondition`), so an over-cap group is
unauthorable through the UI; the zod schema `.max()`s and throws, but on the SERVER's snapshot
parse, not on the builder's publish path, so it is a boundary check on untrusted input rather
than a publish-time failure an author sees; and `resolveVisiblePages` ignores jump rules past
the cap for callers that went through neither. See the caps' own comment in `conditional-rule.ts`
for the residual this leaves (a hand-authored over-cap rule still parses to "no rule", and an
absent show group means VISIBLE).

## 6. MJ framework adoption (checklist, not aspiration)

- Schema via **migrations + CodeGen only**; generated files never hand-edited; TS against new
  columns only after CodeGen (rules 2b/CodeGen).
- Shared contracts in `@mj-biz-apps/forms-entities` imported directly by widget and server —
  no re-exports between packages (rule 5).
- Entity access: `md.GetEntityObject<T>(name, contextUser)`, `RunViews` batched, `.Success`
  checked; `Save()` booleans checked with `LatestResult.CompleteMessage` on failure.
- Builder persistence through the existing debounced entity-save path; snapshot through
  `snapshot-builder.ts` (builder) and `snapshot-parser.ts` (server) — both extended, both
  specced.
- UI: standalone components, `@if`/`@for`, `inject()`, OnPush, `--mj-*` tokens, Font Awesome,
  `mjf-setting-row` idiom; respondent-facing changes (disqualify ending) held to §2 UX bar
  (mobile-first, WCAG AA).
- No `any`, no `.Get()`/`.Set()` weak typing, `${flyway:defaultSchema}`/`${mjSchema}` only in
  shipped SQL, seed manifest + `lint:distribution` before every PR that touches migrations/metadata.

## 7. Open decisions — RESOLVED at implementation

1. **Explicit `EvalExtras { score? }` param** (not a magic answers-map key): added as an
   optional third argument to `evaluateConditionalRule`/`evaluateGroup`/`evaluateCondition`
   and threaded through `resolveEndingScreen`. Zero ripple — every existing call site stayed
   valid. Where no score is supplied a score condition never fires ("unknown" ≠ "zero").
2. **Disqualified responses consume NO quota**: `countsCompletion()` in
   `persistence.service.ts` excludes them from `ResponseCount`, and the form-wide quota check
   keeps counting `Complete` only. They also fire **no automations**.
3. **No new mutation flag.** The widget sends the knockout as one FINISHED submission
   (fail-soft) and locks into the ending; the SERVER re-evaluates `resolveDisqualification` on
   every save but SEALS only a finished one, and writes `Status='Disqualified'` — validation runs
   in partial mode for a disqualified save, so never-reached required questions cannot block the
   terminal write. Sealing on a partial was the plan as first written and it was wrong: the
   autosave debounce catches half-typed values, and a sealed row cannot be corrected. A client
   that "forgets"
   it was disqualified still gets disqualified.

### Implementation notes (deltas from the plan as written)

- The migration is `V202608252340…` (not `…1400…`): two already-applied migrations carried
  later same-day timestamps, so the new one had to sort past the DB frontier.
- Per `migrations/README.md`, CodeGen's run output
  (`migrations/codegen/CodeGen_Run_2026-08-26_02-46-28.sql`) is APPENDED to the migration below
  the `-- CodeGen output (appended)` marker — the EntityField row for IsDisqualification, the
  'Disqualified' EntityFieldValue (+ resequencing), and the regenerated
  vwFormScreens/spCreate/spUpdate/spDeleteFormScreen. Without it a fresh install would get the
  column but not the metadata or procs, and every FormScreen save would silently drop the flag.
  `lint:migrations` and `lint:distribution` both pass with the append in place.
- Jump conditions read questions up to AND INCLUDING their own page (leaving a page is decided
  by what was just answered on it); a page's SHOW rule still reads strictly earlier pages.
  The rules panel carries a separate `jumpSources` input for this.
- The disqualify card is not a JSON verb: it is `FormScreen.IsDisqualification` plus the
  screen's own `show` group. In the panel it is a pseudo-verb card, mutually exclusive with
  the ending's "Show only if" card (both read the same group), emitting the flag through a
  dedicated `disqualifyChange` output.
- `resolveEndingScreen` now EXCLUDES disqualification screens from all three arms — a
  ruleless or default-flagged knockout screen must never become the fallback everyone lands on.
- `clone-remap` (form templates / save-as-copy) was in the blast radius: it silently dropped
  the new verbs and could not remap `jump.toPageId`. It now remaps `require` groups, jump
  when-groups AND jump targets (via the clone's page-id map), and copies score conditions
  verbatim.
- The publish path and the option picker share one option-identity function
  (`publishedOptionIdentities` in `option-labels.ts`) — the A1 fix is drift-proof by
  construction, including the duplicate-value uniqueness rewrite.
