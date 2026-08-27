# Rules Simplification Plan

**Status: ALL PHASES COMPLETE.** Phase 0 `7cd1146` · Phase 1 `9d08b10` · Phase 2 `770b9fc` ·
Phase 3 `8f7a6bb` + this commit. Final baseline: **1,944** tests (272 / 26 / 142 / 1003 / 501),
widget 1197.6 kB, six gates green.

**One deviation from §6, recorded deliberately.** The plan said each hub row opens the same
`RuleEditorDialogComponent` the per-item panels open. It does not: a row **selects its item and
switches to the Build tab**, where that panel — and that dialog — already are. Embedding the
panel in the hub would have meant a second place that knows how to write a rule to a question
versus a page versus a screen, which is exactly the "two write paths for one thing" the same
section forbids two bullets later ("no new write paths"). Navigation keeps the authoring surface
singular, gives the hub zero write code, and lands the author on the item in its own context.
`rules-hub.wiring.spec.ts` pins the no-write property rather than the dialog. Supersedes the *authoring-surface* parts of
`RULES_AND_BRANCHING_PLAN.md` (its C1 `require` verb is **removed** by this plan; its evaluators,
disqualification, jump, and scoring engines stay). Branch: `feat/rules-and-branching` → PR #72.

**§6's Rules hub is gone, on the user's call (2026-08-26).** The tab shipped and worked; it was
in the wrong place. Everything it said about a question belonged BESIDE that question, and it was
a second surface an author had to know existed before they could learn a question was conditional
at all. What replaced it is a badge on the item itself — "Conditional", "Branches", or **"Rule is
broken"** — with the hub's own sentences as its tooltip. `rules-inventory.ts` survives unchanged
in purpose: it still composes every rule into a sentence, and `ruleBadgesFor` groups those per
item. `groupEntriesByPage` and `brokenRuleCount` went with the tab, having no other reader.
`rules-tab.component.ts` is deleted; `rule-badges.wiring.spec.ts` replaces
`rules-hub.wiring.spec.ts` and carries forward the one property that mattered — the silent-hide
warning of §6's third bullet is still shown, now on the item it is about.

**User decisions, 2026-08-26** (recorded verbatim so nobody re-litigates them):

1. `require` — **full removal**: contract, evaluator, builder card, widget + server enforcement.
2. Dropped operators — **full removal** from the union and evaluator, not merely hidden.
3. "One place" — **a form-level Rules view** (a new builder tab), per-item panels stay as entry points.
4. The uncommitted dialog work (12 files) — **committed first as its own commit (Phase 0)**.
5. The user authorized the commit+push at the end of each phase in this plan (their instruction of
   2026-08-26: *"first remove those things then commit"*). Commit exactly at the marked points, no
   others. Every push lands on PR #72.

**Method**: every phase runs the `/tdd` skill — vertical slices, RED before GREEN, and each
behaviour gets a **happy case, an edge case, and a worst case** (§7 enumerates them). A test that
cannot fail is a defect: run the new spec and paste the failing output into your notes *before*
implementing.

---

## §1 Verified current state (2026-08-26, all file:line checked against the working tree)

Facts the implementing agent may rely on without re-deriving. If any grep below disagrees with
this section, **stop and reconcile before editing** — the tree has moved.

### Storage & parsing
- `ConditionalRule` is a JSON column on four entities (`FormQuestion`, `FormPage`, `FormScreen`,
  `FormAutomation`) — generated getters in `packages/Entities/src/generated/entity_subclasses.ts`.
  **No migration is needed anywhere in this plan**: everything removed lives inside JSON.
- `conditionalRuleSchema` (`packages/Entities/src/contracts/schemas.ts:77–81`) is a plain
  `z.object` → zod **strips unknown keys**. Deleting `require` from the schema means a stored rule
  carrying it parses cleanly and the key silently vanishes. No data repair needed.
- `op` is validated by `conditionalOperatorSchema` (`schemas.ts:52`). A stored rule using a
  **removed** operator fails parse. Verified consequences:
  - Server: `parseOptionalConditional` (`snapshot-parser.ts:393–411`) catches, **logs loudly**
    naming the item, and returns `undefined` → the item behaves as if unruled (a show rule
    fails **open**: always visible). This is the documented posture; keep it.
  - Builder: `json-fields.ts` `parseConditionalRule` is tolerant → `undefined` → no rule card.
- **No shipped data uses any of this**: `grep -rn '"op"' migrations/ metadata/` and
  `grep -rl '"require"' migrations/ metadata/` both return nothing. Dev databases may hold
  hand-tested rules (the user authored one); the fail-open above covers them.

### Evaluator facts that shaped the operator decision (do not "fix" these)
- `scalarsEqual` (`conditional-rule.ts:368–373`) returns **false for any array answer** → on a
  multi-select question `equals` can never match and `notEquals` (`!scalarsEqual`) **always**
  matches. This is why the Phase-2 operator menus are source-aware.
- `isMember` (`conditional-rule.ts:416–428`) **intersects** for array answers → `in ['X']` means
  "includes X" and `notIn ['X']` means "does not include X" on a multi-select. This is why
  `notIn` **stays** (an earlier draft of this plan dropped it; that was wrong).
- The capability table (`question-types.ts`) already carries `multiValued: boolean` per type
  (line 93; e.g. `MultiChoice: true` at 117). Derive from it; never hardcode a type list.

### `require` touchpoints (complete list, non-spec)
| File | What |
|---|---|
| `packages/Entities/src/contracts/conditional-rule.ts:124` | `require?: ConditionalGroup` on the interface |
| `packages/Entities/src/contracts/schemas.ts:79` | zod key |
| `packages/Entities/src/contracts/rule-verbs.ts:29–39` | `isRequiredNow` (toggle wins; group only adds) |
| `packages/Angular/src/lib/widget/core/validation.ts:72` | caller |
| `packages/Server/src/public-submit/validation.service.ts:186–189` | caller |
| `packages/Angular/src/lib/widget/core/form-runtime.ts:283–292` | caller (progress bar) + comment |
| `packages/Angular/src/lib/templates/clone-remap.ts:121–182` | require-specific remap branch + `isRequiredNow` comment |
| `packages/Angular/src/lib/builder/rules-panel-model.ts:32,35,64–70` | `GroupVerb = 'show' \| 'require'`, the card |
| `.changeset/rules-and-branching.md` | prose says "conditional `require`" — must be edited in Phase 1 |

Specs touching it: `rule-verbs.spec.ts` (the `isRequiredNow` describe), `clone-remap.spec.ts`
(~:202), `rules-panel-model.spec.ts`, `json-fields.spec.ts` (**the round-1 serialization fix is
tested via a require-only rule — replace with a jump-only rule, do NOT delete the guard**),
`form-runtime.spec.ts` (~:385 progress test), `packages/Server/src/public-submit/__tests__/`
`rule-verbs-validation.spec.ts` + `validation.service.spec.ts`.

**After removal, the static `isRequired` flag is the whole truth again.** The widget's five
`aria-required="q.isRequired"` bindings and the asterisk (`form-question.component.html:14–16`)
become *correct* — an earlier session called them a bug only because `require` could diverge from
the flag. **Do not "fix" them.**

### Operator surface
- Union: 12 (`conditional-rule.ts:25–37`). Evaluator switch: `conditional-rule.ts:215–243`,
  exhaustive via `assertNever`.
- `OPERATOR_CHOICES` (labels + picker order): `condition-sources.ts:79–92`. `operatorLabel`
  falls back to the raw name. `valueEditorKind` (`:122–141`) returns `'text'` for
  affix/ordering ops **even when the source has options** — this is the free-typing hole on
  choice questions ("Soahm") that Phase 2 closes.
- `ConditionalSourceQuestion` (`condition-sources.ts:22–32`) has `id`, `prompt`, `options?` —
  **no multiplicity/numeric info yet**. Phase 2 adds it.
- Helpers that become dead with the drop: `scalarsEqualIgnoreCase` (:381),
  `answerContains` (:499), `stringAffixMatch` (:~400).

### What is already implemented and only needs verification (the ✅ rows)
Show only if (question/page/ending; both ends via `resolveVisibleQuestions`/`resolveVisiblePages`,
fixed-point in `form-runtime.ts` with `MAX_VISIBILITY_PASSES=5`), Jump (forward-only, first match
wins), Disqualify (`IsDisqualification` + `Status='Disqualified'`, no quota/automations/
`SubmittedAt`), Scoring (`computeScore`, `source:'score'` normalized in `conditionComparand`),
ending resolution (`resolveEndingScreen`, "no rule ≠ always" for endings). Plus this session's
uncommitted UI: modal `RuleEditorDialogComponent`, draft/commit/discard (`RuleDraft`,
`isDraftCommittable`, `isDraftDirty`, `sameGroup`), `RULES +` header, spacious editor CSS.

### Builder chrome fact for Phase 3
`form-builder.component.ts:99` — `type BuilderTab = 'build' | 'design' | 'distribute' |
'automate' | 'responses'`, `activeTab` at :183. The Rules hub is a new member of this union;
follow the `AutomationTabComponent` wiring pattern.

### Baselines to beat
1,893 unit tests green (283 entities / 26 core-entities-server / 142 actions / 941 ng /
501 server). Gates: `lint:ui` 0 violations, `lint:distribution` + 72 mutants, widget bundle
1198.5 kB. Record the same numbers after every phase.

---

## §2 Target model

One sentence, three outcomes: **"When ⟨answers match⟩ → show this / skip to page N /
disqualify."** The Required toggle stays untouched. Scoring stays and feeds conditions as
`Total score`.

**Final operator union — 12 → 8.** Keep `equals`, `notEquals`, `in`, `notIn`, `isAnswered`,
`isNotAnswered`, `greaterThan`, `lessThan`. Drop `equalsIgnoreCase`, `contains`, `startsWith`,
`endsWith` (4 dropped — earlier chat messages said "6"; the arithmetic here is the verified one).

**Source-aware menus (Phase 2).** What the operator dropdown offers depends on the source:

| Source kind (derived from capability table) | Operators offered | Value editor |
|---|---|---|
| Single-choice (options, `multiValued: false`) | is · is not · is one of · is answered · is not answered | select / checklist — **never text** |
| Multi-select (options, `multiValued: true`) | includes any of (`in`) · includes none of (`notIn`) · is answered · is not answered | checklist only |
| Free text (no options, text column) | is · is not · is answered · is not answered | text (trimmed) |
| Numeric (no options, numeric column) | is · is not · greater than · less than · is answered · is not answered | text, `inputmode="numeric"` |
| Total score **(ending rules only)** | greater than · less than · is | numeric text |

`equals`/`notEquals` are **not offered** for multi-select (never-match / always-match traps, §1).
One canonical label map; per-kind lists reference it — never a second label for the same op.

**`Total score` is offered on ENDING rules only** — `form-builder.component.ts` adds `SCORE_SOURCE`
to the ending source list and to no other. A mid-form `show` or `Go to` rule reading the running
score would be circular: the score is the sum of what has been answered so far, and a rule that
changes which questions are asked changes the very total it is testing. The widget matches the
builder — `FormRuntime.visiblePages` calls `resolveVisiblePages(pages, answers)` with no
`EvalExtras`, so a score condition reaching a page or question rule through mj-sync, an AI-authored
rule or hand-written JSON is **inert**, not merely unauthorable. Inert is the safe direction (a
`show` gate stays open, a `Go to` never fires), but it is silent; if score-banding mid-form is ever
genuinely wanted, it needs a real answer to the circularity, not a wider source list.

---

## §3 Phase 0 — Commit the standing dialog work

The 12 modified/untracked files (`git status`) are the verified modal + draft/commit work.
1. Re-run the gate battery (§8.3) — it was green on 2026-08-26; confirm it still is.
2. `git add` exactly those 12 files; commit:
   `feat(builder): author rules in a modal with draft/commit — nothing persists until Done`
   (body: the live-write → empty-rule defect, the discard warning, the spacious pass; end with the
   Claude co-author line per repo convention). Push.

## §4 Phase 1 — Removal (`require` + 4 operators), then commit

Work contract-outward: Entities → widget/server callers → builder → collateral. After each package
edit, build that package before moving on.

**RED first.** Update the spec inventory in §1 so the suite *describes the target state* and
fails: delete the `isRequiredNow` describe; retarget `json-fields.spec.ts`'s require-only case to
a **jump-only** rule (same defect guarded); rewrite `clone-remap.spec.ts`'s require case;
delete evaluator cases for the 4 dropped ops and **add** the two legacy-data cases from §7.
Then:

1. **Entities.** Remove `require` from `ConditionalRule` + zod; shrink `ConditionalOperator` and
   `conditionalOperatorSchema` to 8; delete the 4 switch cases (the `assertNever` keeps the switch
   honest) and the 3 dead helpers; delete `isRequiredNow`. Build + entities tests.
2. **Widget/server.** `validation.ts:72` and `validation.service.ts:189` read
   `question.isRequired`; `form-runtime.ts:292` progress reads `q.isRequired` — and **rewrite the
   comment at :283**, which currently explains why the static flag is wrong (it is now right).
3. **Templates.** `clone-remap.ts`: delete the require branch and its `isRequiredNow` comment;
   `show`/`jump` handling unchanged.
4. **Builder.** `GroupVerb` collapses to `'show'`; drop the require card from
   `QUESTION_RULE_CARDS`; trim `OPERATOR_CHOICES` to 8; `valueEditorKind` loses the dropped ops.
   The panel/dialog from Phase 0 needs no structural change.
5. **Collateral (same commit).** Edit `.changeset/rules-and-branching.md` (remove "conditional
   `require`", correct the operator list). Add a supersession note to
   `RULES_AND_BRANCHING_PLAN.md` §C1 pointing here. Log in `FORMS_BUILD_PLAN.md` §12.

**GREEN + zero-checks** (all must return nothing):
```bash
grep -rn "isRequiredNow\|'require'\|equalsIgnoreCase" packages/ --include='*.ts' | grep -v node_modules | grep -v dist
grep -n "'contains'\|'startsWith'\|'endsWith'" packages/Entities/src/contracts/*.ts packages/Angular/src/lib/builder/condition-sources.ts
```
(`startsWith(`/`endsWith(` as *String methods* elsewhere are fine — the quoted-literal grep is the
distinction.) Run §8.3. Commit:
`refactor(rules)!: remove the require verb and 4 operators — one sentence, three outcomes` — body
must state the fail-open behaviour for legacy rules and cite the user's decision. Push.

## §5 Phase 2 — Source-aware condition editing, then commit

Closes the "Soahm" hole: on any option-bearing source the value is **picked, never typed**.

**RED**: extend `condition-sources.spec.ts` (kind derivation per capability-table row —
parameterize over `QUESTION_TYPE_CAPABILITIES`, don't enumerate by hand) and add wiring/spec
cases: multi-select source offers no `equals`; option source never renders a text value editor;
stale stored value still surfaces as the extra `(deleted option)` entry; `<select>` never renders
blank (a `[value]` absent from its options is the known trap — reuse the `staleValue` idiom).

Implement: add `multiValued`/`numeric` (or a single `kind`) to `ConditionalSourceQuestion`,
derived in `toConditionalSource` from the capability table; per-kind operator menus per §2;
`valueEditorKind` becomes kind-driven with `'text'` unreachable for option sources. Verify the
✅ rows still behave by running their existing suites (`rule-verbs.spec`, `scoring.spec`,
`form-screens.spec`, `form-runtime.spec`, server pipeline specs) — no re-implementation.
§8.3, commit (`feat(builder): source-aware operators — values are picked, not typed`), push.

## §6 Phase 3 — The Rules hub (one place), then commit

A new `'logic'` `BuilderTab` ("Rules"), following the Automate tab's wiring. Content:

- **Every rule on the form as one full sentence**, grouped by page in display order:
  *"Show **Email** when **First name** is **Soham**"*, *"After **Page 2**, skip to **Page 4**
  when …"*, *"Disqualify when **Age** is less than **18**"*. Build sentences on the existing
  `summarizeGroup`/`summarizeJump` (extend, don't duplicate — one source of truth for rule prose).
- **Each row opens the exact same `RuleEditorDialogComponent`** the per-item panels open. The hub
  is a view, not a second editor — no new write paths.
- **Broken references surfaced, not hidden**: a rule naming a deleted question/page already
  renders "(deleted question)". In the hub such rows get a warning icon and the tab label a count
  badge. Worst case to design for: a show rule on a deleted source is `NOT_EVALUABLE → false` →
  the item is **hidden for everyone, silently** — the hub is where that becomes visible.
- **Empty state teaches**: one sentence on what rules do + a "+ Add rule" that deep-links into
  picking an item.

Psychology directives (each maps to a testable behaviour, not decoration): recognition over
recall (sentences, options picked from lists); Hick's law (3 outcomes, per-kind operator menus
already trimmed); progressive disclosure (summaries in the hub, controls only in the dialog);
Fitts (`--mjf-tap` targets; the whole row is the click target); Miller (grouped by page, not one
flat list); immediate feedback (the dialog shows the live sentence preview of the rule being
built); safe exploration (draft/discard from Phase 0 — already done); visibility of system status
(the badge for broken rules).

**RED**: a `rules-hub.wiring.spec.ts` in the comment-stripped style of
`rules-panel.dialog.wiring.spec.ts`, plus pure specs for the sentence builder and the
broken-reference collector. §8.3 + `lint:ui` (new CSS: tokens only), commit
(`feat(builder): Rules tab — every rule on the form, in sentences, in one place`), push.

---

## §7 Test matrix (happy / edge / worst per behaviour)

| Behaviour | Happy | Edge | Worst |
|---|---|---|---|
| Legacy `require` key in stored JSON | — | parses clean, key stripped, question not required (Phase 1 spec) | rule that ALSO has `show`: show must survive the strip |
| Legacy dropped-op rule | — | builder: no card rendered | server: parse fails → `LogError` naming the item + item visible to everyone (assert both the log and the fail-open) |
| `equals` vs multi-select | single-choice matches | multi answer → `false` (assert unchanged) | `notEquals` on multi → `true` — assert *and* assert the menu never offers it |
| `in`/`notIn` | scalar in list | array answer intersects | `in` with `[]` → false; `notIn` on unanswered → false (guard exists — keep its test) |
| Score conditions | number vs number | stored `"70"` string normalized (`conditionComparand`) | "score equals banana" stays inert, never NaN-fires |
| Draft dialog (Phase 0) | author → Done → persisted | close untouched → no card, no warning | edit back to original → closes silently (value-equality, not touched-ness) |
| Jump | both halves → persists | target alone → Done disabled | deleted target page → summary says so; evaluation inert |
| Fixed-point visibility | show-rule chain settles | `isNotAnswered` reveal-on-clear | non-convergent form: capped at 5 passes + warning (existing tests must stay green) |
| Rules hub | lists every rule as a sentence | empty form → teaching state | deleted-source rule → flagged row + badge (the silent-hide case) |

---

## §8 Operating rules for the implementing agent

**8.1 Discipline.** `/tdd` per phase; paste RED output before implementing. Never write a test
that asserts `f(x) === f(x)` or asserts the *current* behaviour while describing the target (both
happened on this branch and survived rounds of review). No `any`, no `.Get()`/`.Set()`; derive
types (`SomeEntity['Field']`, `ConditionalOperator`) — never restate a union. PascalCase publics.
Never edit `packages/*/src/generated/**`. All CSS via `--mj-*`/`--mjf-*` tokens.

**8.2 Mechanics that have bitten this branch.** Prefer the Edit tool over regex/python splices
(two files were mangled that way — a `}` matched inside a template literal). Angular `@if`/`@for`
brace imbalance = NG5002: run the package build after every template edit. A `<select>` whose
`[value]` is not among its options renders **blank** — use the stale-entry idiom. Wiring specs
must strip comments before asserting, or they pass against their own documentation. Vitest here is
colocated `.spec.ts` — never `.test.ts`, no `test-utils`.

**8.3 Gate battery — run before every commit, record the numbers:**
```bash
pnpm run build:packages          # TURBO_FORCE=1 if suspicious of cache
npm test                         # baseline 1,893 — must not drop except by counted, named deletions
npm run lint:ui                  # 0 violations
npm run lint:distribution        # unaffected by this plan, but run it
```
The changed test count must be explainable: "deleted N require cases, added M" — write it in the
commit body.

**8.4 CI.** Push after each phase; six checks run on PR #72 (`build-and-test`, `ui-token-gate`,
`distribution-gate`, `changes_and_migrations`, `generated-scope-gate`, `migration-order-gate`).
A "failed" run showing `steps: []` and ~11s duration is **runner starvation, not the code** —
rerun it; verified precedent on this branch (2026-08-26). `changes_and_migrations` passes only
while `.changeset/rules-and-branching.md` exists with a minor bump — Phase 1 edits its prose;
do not delete it.

**8.5 Definition of done.** All four phases committed and pushed; zero-check greps clean; gate
battery green with numbers recorded; `FORMS_BUILD_PLAN.md` §12 has one entry per phase;
manual pass in Explorer (`~/Projects/mj-dev && pnpm turbo start --filter=mj_api
--filter=mj_explorer`, :4201 — registration lives in the gitignored `MJ/mj.config.js`; verify via
startup log, never the tracked config): author each of the three outcomes, close a dialog dirty
and clean, view the hub, and confirm a respondent run at the widget honors a show rule and a
disqualify. Dev-DB caveat: `MJ_ATS_Dev` fixtures are drifted — two smoke paths
(`automation-semantics`, `binding`) fail on fixture data, documented as never-a-product-defect;
do not chase them.
