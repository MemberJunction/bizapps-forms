# UI Audit Criticals Implementation Plan

> **As built (2026-10-28).** This plan is a record of intent; its checkboxes were not ticked as the work landed. Where the code differs, the design's own "As built" note (`docs/superpowers/specs/2026-10-28-ui-audit-criticals-design.md`) is the authority. In short: there is no `shared/dashboard-failure.ts` (the wording already lives in `shared/failure-message.ts`), and there is no `dashboard/report-state.ts` (`reportState` sits beside `railState` in `dashboard/reporting-view-model.ts`). Doodle undo is `widget/components/questions/doodle-strokes.ts` and `doodle-history.ts`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Chosen method: Native** (Soham, 2026-10-28). The session implements every task itself with superpowers:executing-plans, then one fresh reviewer on the most capable model checks the whole branch.

**Goal:** Fix the seven Critical findings and F10 from the 2026-10-28 UI audit in one PR into `next`.

**Architecture:** Four modules from the spec. (1) `DashboardFailure` keeps every dashboard failure inside the dashboard. (2) The `mjfRowActivate` directive replaces clickable containers that hold their own buttons. (3) An `--mjf-on-primary` token and two `lint:ui` rules. (4) Two pure widget functions, `advancesOnEnter` and `questionShape`. Logic lives in pure functions that are tested in Vitest's node environment. Templates get source-text specs (repo convention). Behaviour is proven by a live Playwright smoke on the shared host.

**Tech Stack:** Angular 21 (standalone, signals), Vitest (node environment, no DOM), `node --test` for root scripts, Playwright MCP, axe-core 4.11.1.

**Spec:** `docs/superpowers/specs/2026-10-28-ui-audit-criticals-design.md`. Audit artifact: `https://claude.ai/artifact/MNBtn5ff2z44nGHZmkEbp8`.

## Global Constraints

- One PR from `fix/ui-audit-criticals` into `next`. Inside it, refactor and behaviour change are separate commits.
- **No `git commit`, push or PR without Soham's explicit go** (CLAUDE.md rule 1). Each "Commit" step below stages the files and records the message. The commits are made only when he says so.
- Run `pnpm install` only inside this worktree, never in the main checkout or a member repo.
- No hardcoded colours. Use semantic `--mj-*` tokens only, and `npm run lint:ui` must pass.
- No `any`, no re-exports between packages, `@if`/`@for` + `inject()` in new code, standalone components and directives.
- Do not edit `generated/`. No migrations and no metadata, so the changeset is `patch`.
- Widget: respondent targets stay at least 44px. Use `<mjf-icon>`, never `fa-*`.
- Copy: "Couldn't load this form's responses." + button "Retry". "Couldn't load your forms. Check your connection, then try again." + "Retry". "All {N} forms are archived." + "Show archived".
- Contrast: Forms-owned text is at least 4.5:1 and controls at least 3:1, in light and dark.
- Unit tests run in the node environment. A component that uses `inject()` or signal inputs cannot be rendered there, so put logic in pure functions and check templates by source text.

## Review Focus

1. **Archive confirm inside a home row:** Enter and Space on "Archive" or "Cancel" must act on those buttons and never open the form. Pinned in Task 4.
2. **Drag release on a builder card:** dropping a question after a drag must not also select or deselect it. Pinned in Task 4 (pointer travel over 4px is ignored).
3. **Enter inside the one-question Legal terms region and in file "Choose a file":** Enter must not advance. Pinned in Task 1 (`role=region`, `input[type=file]`).
4. **Analytics opened on a form whose report fails, then a different form picked:** the failed card must clear and the new report must load. Pinned in Task 3 (`reportState` after a new selection).
5. **Required Matrix with one row answered:** the error names the question, and each row is still announced as its own group. Pinned in Task 5 (source-text check plus a live check in Task 6).

---

### Task 0: Workspace ready and baseline recorded

**Files:** none changed.

- [ ] **Step 1:** Copy the env file: `cp /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.env .env`. It is gitignored. Check with `git check-ignore .env`.
- [ ] **Step 2:** In the worktree, run `pnpm install`, then `pnpm run build:packages`. Expected: exit 0, and `packages/Entities/dist` exists.
- [ ] **Step 3:** Baseline: `cd packages/Angular && pnpm test`, then `pnpm run typecheck`, and at the root `npm run lint:ui`. Record the pass counts in the plan's progress note. Expected: all green, the same as the main checkout, which runs about 114 files.

---

### Task 1: Enter advances only from a text field (F03)

**Files:**
- Create: `packages/Angular/src/lib/widget/components/enter-advances.ts`
- Test: `packages/Angular/src/lib/widget/components/enter-advances.spec.ts`
- Modify: `packages/Angular/src/lib/widget/components/form-one-question.component.ts:236-241`
- Test (source text): `packages/Angular/src/lib/widget/components/enter-advances.wiring.spec.ts`

**Interfaces:**
- Produces: `export function advancesOnEnter(target: EnterTarget | null): boolean`, where `export interface EnterTarget { tagName: string; getAttribute(name: string): string | null; closest?(selector: string): unknown | null }`. A real `Element` satisfies it.

- [ ] **Step 1: Write the failing test** `enter-advances.spec.ts`. Fake targets are plain objects.
  - `advancesOnEnter(input('text'))`, `input('email')`, `input('tel')`, `input('number')`, `input('url')`, `input('date')`: each `true`.
  - `input('checkbox')`, `input('radio')`, `input('file')`, `input('button')`, `input('submit')`: each `false`.
  - `{tagName:'TEXTAREA'}`, `{tagName:'BUTTON'}`, `{tagName:'A'}`, `{tagName:'SELECT'}`: each `false`.
  - `{tagName:'DIV', role:'radio'}`, `role:'checkbox'`, `role:'option'`, `role:'button'`, `role:'region'`: each `false`.
  - `null`: `false`.
- [ ] **Step 2:** Run `cd packages/Angular && npx vitest run src/lib/widget/components/enter-advances.spec.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `advancesOnEnter` as an allow-list. It returns true only for `INPUT` whose `type` (default `text`) is in `{text, email, tel, url, number, search, password, date, time, datetime-local, month, week}`.
- [ ] **Step 4:** Run the same spec. Expected: PASS.
- [ ] **Step 5: Wire it:** `onKeydown` becomes `if (event.key === 'Enter' && advancesOnEnter(event.target as Element | null)) { event.preventDefault(); void this.onNext(); }`. Update the doc comment: "Enter in a text field advances. Enter on a control (Back, a choice, Retry, Choose a file) activates that control."
- [ ] **Step 6: Source-text spec** `enter-advances.wiring.spec.ts`: `form-one-question.component.ts` (comments stripped) calls `advancesOnEnter(` inside `onKeydown` and no longer contains `tagName !== 'TEXTAREA'`. Run it. Expected: PASS.
- [ ] **Step 7: Commit (after go):** `fix(forms-ng): Enter on Back or a choice no longer advances in one-question mode`

---

### Task 2: Token layer and the gate that keeps it (F02, F04, F06)

**Files:**
- Modify: `scripts/check-ui-tokens.mjs`: export the rule functions, guard `main()` with `process.argv[1]?.endsWith('check-ui-tokens.mjs')` (same as `check-paths-touched.mjs:69`), and add the token-rule gate.
- Create: `scripts/check-ui-tokens.spec.mjs` (`node --test`)
- Modify: root `package.json`: add `"lint:ui:test": "node --test scripts/check-ui-tokens.spec.mjs"` and register it wherever CI runs the other `lint:*:test` scripts (grep `.github/workflows` for `lint:paths-touched:test`).
- Modify: `packages/Angular/src/lib/shared/forms-ui.ts:45-70` (add the token), `:210`
- Modify: `packages/Angular/src/lib/builder/form-builder.styles.ts:384, :602-607, :656` (`.fb-q-num`), `.fb-page-target`
- Modify: `packages/Angular/src/lib/builder/conditional-rule-editor.component.ts:60`
- Modify: `packages/Angular/src/lib/templates/templates-gallery.styles.ts:71, :78`
- Modify: `packages/Angular/src/lib/dashboard/forms-reporting-dashboard.styles.ts:108` and `.rp-alert-close`
- Modify: the Design preview screen label rule (`.ps-screen__label` in `builder/form-preview-stage.component.ts`)
- Modify (allow markers only): `home/forms-home-dashboard.styles.ts:45`, `dashboard/components/question-breakdown.component.ts:198`, `dashboard/components/open-text-panel.component.ts:135`, `builder/form-builder.styles.ts:764`, `builder/question-editor.component.ts:140`

**Interfaces:**
- Produces: CSS token `--mjf-on-primary`, defined beside `--mjf-tap` and equal to `var(--mj-text-inverse)`. Task 4 uses it for any new primary.
- Produces: `export function tokenRuleViolations(lines: string[], relPath: string): { line: number; rule: 'on-primary' | 'disabled-for-content'; text: string }[]`

- [ ] **Step 1: Write the failing test** `scripts/check-ui-tokens.spec.mjs`:
  - `'  color: var(--mj-brand-on-primary);'` in `packages/Angular/src/lib/shared/x.ts` gives one `on-primary` violation.
  - The same line in `packages/Angular/src/lib/widget/mj-form.component.css` gives `[]`.
  - `'.x { color: var(--mj-text-disabled); }'` gives one `disabled-for-content` violation.
  - `'.x:disabled { color: var(--mj-text-disabled); }'`, `'.x::placeholder { color: var(--mj-text-disabled); }'`, `'.x[aria-disabled="true"] { … }'` and `'.x.is-disabled { … }'` each give `[]`.
  - The line `/* ui-gate: allow-disabled-token — decorative separator */` followed by `.dot { color: var(--mj-text-disabled); }` gives `[]`.
  - The marker without a reason (`ui-gate: allow-disabled-token`) still gives a violation.
  - The existing `--self-test` path still exits 0 (spawn it with `node`).
- [ ] **Step 2:** Run `node --test scripts/check-ui-tokens.spec.mjs`. Expected: FAIL, because `tokenRuleViolations` is not exported (and importing currently runs `main()`).
- [ ] **Step 3:** Implement `tokenRuleViolations`. Judge the selector from the same line or, for a multi-line rule, from the nearest preceding line that contains `{`. The marker sits on the line before, using the same em-dash-plus-reason form as `ALLOW_MARKER`. Call it from `main()` after the colour gate and report with the existing `annotate()`. Exit non-zero on any violation.
- [ ] **Step 4:** Run the spec. Expected: PASS. Then run `npm run lint:ui`. Expected: FAIL, listing the existing uses from the files above. That proves the gate sees them.
- [ ] **Step 5: Fix the values** (no marker where the value itself is wrong):
  - `--mjf-on-primary: var(--mj-text-inverse);` with a comment: "MJ's --mj-brand-on-primary is #fff in dark on #4095d2 (3.25:1). Switch here when MJ fixes it upstream."
  - `.mjf-btn--primary`, `form-builder.styles.ts:384` and `.cre-seg.is-on` use `color: var(--mjf-on-primary)`.
  - `.tg-card-meta`, `templates-gallery.styles.ts:78` and `.rp-form-count.is-none` use `var(--mj-text-muted)`.
  - The `.fb-q-handle` glyph uses `var(--mj-text-muted)`. The handle box is `min-width: 24px; min-height: 40px`.
  - `.fb-q-num` uses `var(--mj-text-secondary)`.
  - `.fb-page-target` and the preview screen label use `var(--mj-brand-primary-hover)` for text on their tint.
  - `.rp-alert-close` gets `min-width: 32px; min-height: 32px`.
  - Decorative uses get the allow marker with a reason. The chevron, `.qb-dot`, `.otp-dot` and the two empty-state icons are decorative (reason: "decorative glyph, not text or a control").
- [ ] **Step 6:** Run `npm run lint:ui` and `npm run lint:ui:test`. Expected: both PASS.
- [ ] **Step 7: Commits (after go):**
  - First: `chore(ui-gate): reject --mj-brand-on-primary and --mj-text-disabled on content`. The gate, its spec, and markers on every existing violation, so this commit alone is green.
  - Second: `fix(forms-ng): primary text, muted text and handle size pass contrast and target size in both themes`. The value fixes, removing the markers they replace.

---

### Task 3: Dashboard failures stay in the dashboard (F01, F10)

**Files:**
- Create: `packages/Angular/src/lib/shared/dashboard-failure.ts` + `dashboard-failure.spec.ts`
- Create: `packages/Angular/src/lib/dashboard/report-state.ts` + `report-state.spec.ts`
- Create: `packages/Angular/src/lib/home/home-list-state.ts` + `home-list-state.spec.ts`
- Modify: `packages/Angular/src/lib/dashboard/forms-reporting-dashboard.component.ts` (replace `errorMessage`, `fail`, `dismissError`, and add the `reportFailed` flag and the `reportState` getter) and `.html:124-160`
- Modify: `packages/Angular/src/lib/home/forms-home-dashboard.component.ts` (replace `fail`, `errorMessage`, dismiss) and `.html:20-23, :66-115`
- Test (source text): `packages/Angular/src/lib/dashboard/forms-reporting-dashboard.no-host-error.wiring.spec.ts`

**Interfaces:**
- Produces:
  - `export class DashboardFailure { get Message(): string | null; Report(err: unknown, action: string): void; Dismiss(): void }`. It is a plain class and not injectable, so it is testable in node.
  - `export type ReportState = 'loading' | 'unavailable' | 'failed' | 'empty' | 'ready'` and `export function reportState(s: { loading: boolean; failed: boolean; unavailable: string | null; report: { hasResponses: boolean } | null }): ReportState`.
  - `export type HomeListState = 'loading' | 'failed' | 'first-run' | 'all-archived' | 'no-match' | 'list'` and `export function homeListState(s: { loading: boolean; failed: boolean; total: number; archived: number; visible: number; query: string; showArchived: boolean }): HomeListState`.

- [ ] **Step 1: Write the failing tests:**
  - **`dashboard-failure.spec.ts`:**
    - After `Report(new Error('boom'), 'Failed to load the report.')`, `Message` equals `failureMessage(err, action)` from `shared/failure-message.ts`.
    - `LogError` is called once with a string that contains the action. Mock `@memberjunction/core`'s `LogError` with `vi.mock`.
    - After `Dismiss()`, `Message` is `null`.
    - The class has no `Error`/`emit` member (`Object.getOwnPropertyNames(DashboardFailure.prototype)`).
  - **`report-state.spec.ts`:** loading wins over everything. Failed wins over unavailable. `{report:null, failed:false, unavailable:null, loading:false}` gives `'failed'`, because a null report that is not loading and not refused is a failure. `hasResponses:false` gives `'empty'`. `hasResponses:true` gives `'ready'`. Review Focus 4: the sequence failed, then a new selection (loading true), then ready.
  - **`home-list-state.spec.ts`:**
    - `{failed:true, total:0}` gives `'failed'`, and never `'first-run'`.
    - `total:0, failed:false` gives `'first-run'`.
    - `total:5, archived:5, showArchived:false, query:''` gives `'all-archived'`.
    - `visible:0, query:'zz'` gives `'no-match'`.
    - `visible:3` gives `'list'`.
- [ ] **Step 2:** Run all three specs. Expected: FAIL, modules missing.
- [ ] **Step 3:** Implement the three modules. The class doc comment carries the invariant once: "A Forms dashboard never emits BaseDashboard.Error after it can render: every failure has an in-dashboard state with a way out. A throw from initDashboard/loadData is still reported by MJ's BaseDashboard.runGuardedLoad."
- [ ] **Step 4:** Run the specs. Expected: PASS.
- [ ] **Step 5: Refactor commit (no behaviour change):** both dashboards hold `protected readonly failure = new DashboardFailure()`. Their `fail()` calls `this.failure.Report(...)` and **still** `this.Error.emit(...)`. Templates read `failure.Message`. Run `pnpm test` and `pnpm run typecheck`. Expected: PASS. Commit (after go): `refactor(forms-ng): one DashboardFailure for both dashboards`.
- [ ] **Step 6: Write the failing source-text spec** `forms-reporting-dashboard.no-host-error.wiring.spec.ts`:
  - Neither component's `.ts` (comments stripped) contains `this.Error.emit`.
  - The reporting template has a branch on `reportState === 'failed'` whose button calls `refresh()` and reads "Retry".
  - The home template branches on `homeListState` and has the copy "All {{ … }} forms are archived".
  - Run it. Expected: FAIL.
- [ ] **Step 7: Implement:**
  - Remove both `Error.emit` calls (and `fail()` where it becomes a one-line pass-through).
  - Reporting: in `loadReportFor`, set `reportFailed = true` in the catch and clear it at the start. Add the `reportState` getter. Template: an `@switch (reportState)` replaces the `loadingReport`/`summaryUnavailable`/`report` chain. The `'failed'` case is an `mjf-empty` with the exact copy and a `mjf-btn mjf-btn--primary` "Retry" calling `refresh()`.
  - Home: add the `homeListState` getter. Template `@switch`. `'failed'` gets the exact copy, `role="alert"` and "Retry" calling the existing load. `'all-archived'` gets "Show archived", which toggles the existing flag. Remove the separate top `errorMessage` banner for list failures. Keep it for action failures such as archive.
- [ ] **Step 8:** Run `pnpm test` (all) and `pnpm run typecheck`. Expected: PASS. Commit (after go): `fix(forms-ng): a failed report or form list stays in the dashboard with Retry instead of blanking the page`.

---

### Task 4: Rows activate without nesting controls (F05)

**Files:**
- Create: `packages/Angular/src/lib/shared/row-activate.ts` (pure decision) + `row-activate.spec.ts`
- Create: `packages/Angular/src/lib/shared/row-activate.directive.ts` (thin adapter)
- Modify: `packages/Angular/src/lib/shared/forms-ui.ts` (`.mjf-row` focus via `:has(.mjf-row-primary:focus-visible)`, and the `.mjf-row-primary` button reset)
- Modify: `home/forms-home-dashboard.component.html:119-170` (+ `.ts` imports), `templates/templates-gallery.component.html:21-45` (+ `.ts`), `builder/form-builder.component.html:365-384, :516-611, :662-708` (+ `.ts` imports, `.styles.ts` for `.fb-q-label` as a button)
- Rewrite: `home/forms-home-dashboard.template.spec.ts` (its premise, the row handling Enter and Space, is what this task removes)
- Test (source text): `shared/row-activate.wiring.spec.ts`

**Interfaces:**
- Produces:
  - `export interface RowNode { tagName: string; parentElement: RowNode | null; getAttribute(name: string): string | null; hasAttribute(name: string): boolean; isContentEditable?: boolean }`
  - `export function startsInsideControl(target: RowNode | null, host: RowNode): boolean`
  - `export function rowClickActivates(c: { target: RowNode | null; host: RowNode; selectionInsideHost: boolean; pointerTravelPx: number }): boolean`
  - Directive `RowActivateDirective`, selector `[mjfRowActivate]`, standalone, `@Output() mjfRowActivate = new EventEmitter<MouseEvent>()`. It adds no `tabindex`, `role` or key handler. It records `pointerdown` coordinates and judges `click`.

- [ ] **Step 1: Write the failing test** `row-activate.spec.ts` with fake `RowNode` trees (host > title button, host > actions > button > icon span, host > text span):
  - The click target is the icon span inside an action button: `startsInsideControl` is `true` and `rowClickActivates` is `false`.
  - The target is a plain text span: `true` (activates).
  - `a[href]`, `input`, `select`, `textarea`, `label`, `[role=button]`, `[role=checkbox]`, `[role=radio]`, `[role=switch]` and `contenteditable` ancestors: no activation.
  - A `<button>` that is the host itself: activates. The walk stops at the host and does not climb above it.
  - `selectionInsideHost: true`: no activation.
  - `pointerTravelPx: 5`: no activation. `4`: activates (Review Focus 2).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the two pure functions. The directive calls `rowClickActivates({ target: event.target as Element, host: el.nativeElement, selectionInsideHost, pointerTravelPx })`, where `selectionInsideHost` = `!sel.isCollapsed && host.contains(sel.anchorNode)`. On true it emits.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Write the failing source-text spec** `row-activate.wiring.spec.ts` and the rewritten `forms-home-dashboard.template.spec.ts`:
  - No `role="button"` and no `tabindex="0"` on `.mjf-row` (home), `.tg-card` (templates), `.fb-q` or screen cards (builder).
  - Each of those carries `(mjfRowActivate)=`.
  - Each has exactly one element with `class` containing `mjf-row-primary` (home and templates) or `fb-q-label` as a `<button` (builder), and that element's `(click)` calls the same handler.
  - `form-builder.component.html` contains zero `$event.stopPropagation()`, and `templates-gallery.component.html` contains zero.
  - The home archive confirm group no longer needs `(keydown)="$event.stopPropagation()"` (Review Focus 1: the row no longer listens for keys, so nothing leaks).
  - Run them. Expected: FAIL.
- [ ] **Step 6: Implement the templates:**
  - Home: the row title becomes `<button type="button" class="mjf-row-primary" [attr.aria-label]="'Open ' + row.name" (click)="openForm(row)">`.
  - Templates: `.tg-card-name` becomes the primary button. Its label is "Create a form from {name}".
  - Builder: `.fb-q-label` becomes `<button type="button" class="fb-q-label" (click)="selectQuestion(node)">`. Move buttons get the question's name in their label: `'Move ' + node.entity.Prompt + ' up'`.
  - Remove `tabindex`, `role` and the key handlers from the containers. Remove every `stopPropagation`.
  - Add the `.mjf-row-primary` reset (inherit font, colour and weight, no border or background, `text-align: start`, `min-height: var(--mjf-tap)` only in the builder card if the row is shorter) and the `:has(:focus-visible)` focus ring.
- [ ] **Step 7:** Run `pnpm test`, `pnpm run typecheck`, `npm run lint:ui`, and the Angular build `pnpm run build`. Expected: PASS. ngc strictTemplates is the real gate for the builder (the memory says the suite never compiles that component).
- [ ] **Step 8: Commits (after go):**
  - `feat(forms-ng): mjfRowActivate, row activation that ignores inner controls, selection and drag release`. The pure module, the directive, and their specs.
  - `fix(forms-ng): rows and cards are no longer buttons that contain buttons`. The templates and the rewritten template spec.

---

### Task 5: Every question type is labelled and grouped natively (F11)

**Files:**
- Create: `packages/Angular/src/lib/widget/components/questions/question-shape.ts` + `question-shape.spec.ts`
- Modify: `packages/Angular/src/lib/widget/components/questions/form-question.component.ts` (`shape` computed, `matrixName(row)`, describedby for composites) and `.html` (`:12`, `:344-372`, `:378-391`, `:484-507`) and `.css` (matrix native radio styling, `fieldset` reset)
- Modify: `packages/Angular/src/lib/widget/components/questions/aria-idrefs.wiring.spec.ts` (extend it, do not loosen it)
- Test (source text): `packages/Angular/src/lib/widget/components/questions/question-shape.wiring.spec.ts`

**Interfaces:**
- Consumes: `FormQuestionType` and `FORM_QUESTION_TYPES` from `@mj-biz-apps/forms-entities/contracts` (already imported by `aria-idrefs.wiring.spec.ts`).
- Produces: `export type QuestionShape = 'control' | 'group' | 'grid' | 'fieldset'` and `export function questionShape(type: FormQuestionType): QuestionShape`, an exhaustive `switch` with no `default`.

- [ ] **Step 1: Write the failing test** `question-shape.spec.ts`:
  - For every `t` in `FORM_QUESTION_TYPES`, `questionShape(t)` returns one of the four shapes.
  - `ShortText`, `LongText`, `Email`, `Phone`, `Website`, `Number`, `Dropdown`, `Date`, `Time`, `FileUpload` and `Checkbox` give `'control'`.
  - `SingleChoice`, `MultiChoice`, `Rating`, `NPS`, `YesNo`, `PictureChoice`, `OpinionScale`, `Legal`, `Ranking` and `Doodle` give `'group'`.
  - `Matrix` gives `'grid'`.
  - `Address` and `ContactInfo` give `'fieldset'`.
  - Use the exact type names from `FORM_QUESTION_TYPES`. If a name differs (for example `Phone`), use the contract's spelling and keep the mapping.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `questionShape`. Run it. Expected: PASS.
- [ ] **Step 4: Refactor commit (no output change except the dangling `for`):**
  - The shared header at `:12` renders `<label for>` only when `shape() === 'control'`.
  - For `group` and `grid` it renders `<span class="mjf-question__label" [id]="labelId()">` with the same children.
  - For `fieldset` the header moves into the composite block as the `<legend>` (next step).
  - Extend `aria-idrefs.wiring.spec.ts`: every `[attr.for]` in the template must sit inside a `@if (shape() === 'control')` region.
  - Run `pnpm test`. Expected: PASS. Commit (after go): `refactor(forms-ng): question label markup follows one per-type shape`.
- [ ] **Step 5: Write the failing source-text spec** `question-shape.wiring.spec.ts`:
  - Every `role="radiogroup"`/`role="group"` element in a `group` branch has `[attr.aria-required]="q.isRequired"`.
  - The Matrix branch contains `type="radio"` and `[name]="matrixName(row` and no `role="radio"`.
  - The composite block is a `<fieldset` with a `<legend` holding `q.prompt`, and each sub-input's `[attr.aria-describedby]` includes `helpId()`.
  - The Checkbox branch's visible label reads `q.prompt` and does not read `placeholder()`.
  - Run it. Expected: FAIL.
- [ ] **Step 6: Implement:**
  - `aria-required` on the eight group elements and Ranking's list.
  - Matrix: `<input type="radio" class="mjf-matrix__pick" [name]="matrixName(row.value)" [checked]="isMatrixSelected(…)" [attr.aria-label]="row.label + ': ' + col.label" (change)="onMatrix(…)">`, with `matrixName(row) = inputId() + '-row-' + row`. The CSS keeps the current visual (an `appearance: none` circle using the existing `.mjf-choice__mark` look) at a 44px cell target.
  - Composites: a `<fieldset class="mjf-composite">` with a `<legend class="mjf-question__label" [id]="labelId()">` holding the prompt and the required marker. Sub-field describedby is `[helpId(), fieldError ? partErrorId(field) : null]` joined, with nulls dropped.
  - Checkbox: the visible label is `q.prompt`. `placeholder()` moves to the help line when it is set.
  - Doodle and Ranking: confirm their group element names via `labelId()`. Add `aria-required`.
- [ ] **Step 7:** Run `pnpm test`, `pnpm run typecheck`, `pnpm run build` (ngc + widget bundle) and `npm run lint:ui`. Expected: PASS. Commit (after go): `fix(forms-ng): matrix rows, address and contact fields, and required groups are announced correctly`.

---

### Task 6: Live smoke, logs, and fixes found there

**Files:** fixes only where the smoke finds a defect. Each defect gets a reproduction first, then a failing test, then the fix.

- [ ] **Step 1: Stage the branch UI on the shared host** (approved by Soham 2026-10-28 for this PR):
  1. `cp -a <main>/packages/Angular/dist <scratchpad>/main-angular-dist-backup`
  2. `rsync -a --delete <worktree>/packages/Angular/dist/ <main>/packages/Angular/dist/`
  3. Wait for "Application bundle generation complete" in `/tmp/mj-explorer.log`.
  4. The widget bundle at `:4000/forms/widget/mj-form.js` is read from that dist per request. Check with `fetch(…, {cache:'reload'})` and grep for `advancesOnEnter`'s allow-list text.
- [ ] **Step 2: Logs.**
  - Check that `/tmp/mj-api.log` is live (byte count grows across 5s, per WORKSPACE §4). If it is stale, ask Soham before restarting `:4000`.
  - Collect browser console errors per screen with Playwright `console_messages`.
- [ ] **Step 3: Throwaway fixture** (approved). In Explorer, save "All Question Types — Smoke" as a template named `UI audit smoke 2026-10-28`. Create a form from it with the same name, publish it, and create a share link with the slug `ui-audit-smoke-20261028`. Record the Form, FormVersion, FormDistribution and template ids in the plan's progress note.
- [ ] **Step 4: Walk and measure.** Light and dark, 1440 and 390, keyboard only:
  - **F01:** Analytics shows the rail and the in-pane "Couldn't load this form's responses." with Retry, not the host error page. `MJ_ATS_Dev` still has no `Forms:*` queries, which reproduces the failure for free.
  - **F02/F04/F06:** axe `color-contrast` and target-size checks on home, every builder tab and templates. 0 Forms-owned nodes.
  - **F05:** axe `nested-interactive` is 0. Tab order on a home row: title, then the Archive icon. Enter on Archive opens the inline confirm, and Enter on Cancel closes it. Drag a builder question and the drop does not change the selection.
  - **F03:** on the fixture in one-question mode, Enter on Back goes back. On the last question, Enter on Back does not submit.
  - **F11:** fixture sections 2–4. Matrix rows announce as radio groups and arrow keys move within a row. The Address legend is the prompt. axe on each section shows 0.
  - **F10:** to reproduce the home "failed" state, block `/graphql` for the home load with `page.route(..., r => r.abort())` once. Expected: error copy with Retry and no "No forms yet". Then unroute and press Retry.
- [ ] **Step 5:** For each defect found: reproduce it live, then write a failing spec in the owning task's style, fix it, and rebuild and re-stage the dist. Re-run the affected checks.
- [ ] **Step 6: After screenshots**, the same views as the audit's before shots. Save them under `.playwright-mcp/shots/after-*.png` and publish a small before/after HTML artifact per module.
- [ ] **Step 7:** Leave Playwright open on Explorer with the branch UI staged for Soham. **Do not restore the dist yet.** Tell him that the restore command is waiting and that `:4201` serves this branch until then.

---

### Task 7: Whole-branch review, changeset, handoff

**Files:**
- Create: `.changeset/ui-audit-criticals.md` (`patch` for `@mj-biz-apps/forms-ng`)
- Modify: `docs/superpowers/specs/2026-10-28-ui-audit-criticals-design.md` only if the review changes a decision.

- [ ] **Step 1:** Run one fresh reviewer (`adversarial-reviewer`, most capable model) on `origin/next...HEAD` with the spec path. Fix confirmed findings test-first.
- [ ] **Step 2:** Changeset text, user-facing: "Analytics and the Forms home keep working when one load fails, with a Retry in place; rows and cards no longer nest buttons; primary buttons, muted text and the drag handle pass contrast and size in dark mode; Enter in one-question mode no longer submits from the Back button; matrix, address and required choice questions are announced correctly."
- [ ] **Step 3: Final gate:** root `pnpm test`, `npm run lint:ui`, `npm run lint:ui:test`, `cd packages/Angular && pnpm run typecheck && pnpm run build`. Expected: all green. `git status` lists only the intended files.
- [ ] **Step 4:** Report to Soham: what changed, the artifact links, the fixture ids to delete, the dist restore command, and the commit list waiting for his go.

---

## Progress notes

(Filled in during execution: baseline counts, fixture ids, smoke findings.)
