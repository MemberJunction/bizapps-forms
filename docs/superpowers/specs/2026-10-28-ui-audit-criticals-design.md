# UI audit criticals: design

> **As built (2026-10-28), where it differs from this design:**
>
> - **Module 1:** there is no `DashboardFailure` class. `shared/failure-message.ts` already holds
>   the shared wording, so each dashboard's `fail()` simply stops emitting `Error`, pinned by
>   behaviour specs. `reportState` sits beside `railState` in `dashboard/reporting-view-model.ts`.
>   The home list failure is its own field, `listLoadError`.
> - **Module 2:** starter template cards and the builder section head also use `mjfRowActivate`.
>   The section title selects the section on click (not focus).
> - **Module 3:** the gate rules and the value fixes landed in one commit.
> - **Module 4:** Checkbox is unchanged; its prompt already labels it. `aria-required` is set on
>   radio groups only. Matrix radios cannot be cleared once a row is answered. `questionShape`
>   has a fifth shape, `none`, for Statement.
>
> Every deviation, with its cost, is in the plan's ledger rulings. That ledger is not committed;
> its decisions are summarised in the PR body.

Source: the 2026-10-28 UI audit (artifact `MNBtn5ff2z44nGHZmkEbp8`, findings F01–F06 and F11).
Branch `fix/ui-audit-criticals` from `origin/next` `001a1ad`. Paths are relative to
`packages/Angular/src/lib/` unless stated.

Decisions taken with Soham before this design:

| Question | Decision |
|---|---|
| When does a Forms dashboard emit the host `Error`? | Never once it can render its own state. |
| Where does the dark-mode primary fix live? | In Forms now, plus an MJ issue for `--mj-brand-on-primary`. |
| PR split | One PR per module below. In each PR the refactor and the behaviour change are separate commits. |
| Builder question card keyboard model | The question title is the select button. The card is no longer a tab stop. |

The seven Critical findings come from four places in the code. Each place gets one module.

---

## Module 1: dashboard failure stays in the dashboard (F01)

### Problem

MJ's dashboard host subscribes to `Error` and, until the first `LoadCompleteEvent`, replaces
the whole dashboard with "Unable to Load Dashboard" (`MJ/…/dashboard-resource.component.ts:825`).
Both Forms dashboards route every failure through a private `fail()` that emits `Error`:

- `dashboard/forms-reporting-dashboard.component.ts:486-491`
- `home/forms-home-dashboard.component.ts:608-613`

On the Analytics page the first load selects `forms[0]` and loads its report inside the
host's first-load window. One failed `Forms.GetResponseSummary` therefore blanks the page,
although the dashboard has its own banner and a rail retry. After a later failure the
report pane is also left empty. `report` is `null` and no branch at
`forms-reporting-dashboard.component.html:146-157` covers "the report failed", so
dismissing the banner leaves a blank pane.

### Interface

One class, `DashboardFailure`, in `shared/dashboard-failure.ts`. Each dashboard owns one.

```ts
export class DashboardFailure {
  /** What the reader sees; null when there is nothing to show. */
  public get Message(): string | null;
  /** Log with context and show `action`'s failure. Never escalates to the host. */
  public Report(err: unknown, action: string): void;
  public Dismiss(): void;
}
```

Invariant, written in the class's doc comment once instead of in two `fail()` copies:
*a Forms dashboard never emits `BaseDashboard.Error` after it can render. Every failure
has an in-dashboard state with a way out.* A throw from `initDashboard`/`loadData` itself
is still reported by MJ's `BaseDashboard.runGuardedLoad`, so the host keeps a signal for
"this dashboard cannot start at all".

Hidden: the `failureMessage()` wording, `LogError` with the action, and the decision not
to emit. The `cause` chaining that home uses today moves into the log line.

### The report pane gets a failed state

This follows the existing pure `railState()` selector:

```ts
export type ReportState = 'loading' | 'unavailable' | 'failed' | 'empty' | 'ready';
export function reportState(loading: boolean, failed: boolean, unavailable: string | null,
                            report: FormReport | null): ReportState;
```

`'failed'` renders an `mjf-empty` card in the pane: "Couldn't load this form's responses.
Retry". It reuses `refresh()`. The top banner stays for failures that are not about the
pane (export).

### Deletion test

Delete `DashboardFailure` and each dashboard needs its own message field, logging, dismiss
and non-escalation rule again. That is two copies of one decision, which is today's bug.

### Tests (through the interface)

- `dashboard-failure.spec.ts`: `Report` sets `Message`, logs once with the action, and
  `Dismiss` clears it.
- `forms-reporting-dashboard.component.spec.ts`: a rejected `loadReport` during the
  first load means `Error` never emits, `reportState` is `'failed'` and Retry calls
  `loadReport` again. Mirror this for a home list failure.
- Live check: on `MJ_ATS_Dev`, which has no `Forms:*` queries today, Analytics shows the rail
  and the failed card instead of the host error page.

### PR 1 commits

1. Refactor: extract `DashboardFailure`. Both dashboards use it and still emit (no
   behaviour change).
2. Behaviour: stop emitting, and add `reportState` and the failed pane.

---

## Module 2: a clickable row with real controls inside (F05)

### Problem

Seven containers are both the click target and the keyboard target, and they hold
other buttons:

- home rows: `home/forms-home-dashboard.component.html:119-127`
- template cards: `templates/templates-gallery.component.html:21-30`
- builder question cards: `builder/form-builder.component.html:516-526`
- welcome and ending screens: `:370`, `:667`

axe reports `nested-interactive` (serious, WCAG 4.1.2) for each of them. The design also
leaks into every inner control. There are eight `$event.stopPropagation()` calls in the
builder template (`:383`, `:462`, `:564`, `:596`, `:603`, `:610`, `:634`, `:708`), two on the
template delete button, and a keydown trap on the home archive confirm (its own comment
says Enter would otherwise open the form). Each new inner control has to remember them.

### Interface

One standalone directive, `shared/row-activate.directive.ts`:

```html
<article class="mjf-row" (mjfRowActivate)="openForm(row)">
  <button type="button" class="mjf-row-primary" (click)="openForm(row)">{{ row.name }}</button>
  …
  <button type="button" (click)="archive(row)">Archive</button>   <!-- no stopPropagation -->
</article>
```

That is one output and no inputs. The caller's contract: put exactly one real `<button>` or
`<a>` in the row as its keyboard path, and point it at the same handler.

Hidden behind the output:

- It ignores clicks that start inside an interactive descendant (`button, a[href], input,
  select, textarea, label, [role=button], [role=checkbox], [role=radio], [contenteditable]`)
  and walks the composed path only up to the host.
- It ignores a click that ends a text selection (`getSelection()` is not collapsed inside the host).
- It ignores the click a CDK drag produces on release (pointer moved more than 4px since
  `pointerdown`). Builder cards need this.
- It never adds `tabindex`, `role` or key handlers to the host. Keyboard activation belongs to
  the primary control, so focus order and screen-reader output stay native.

Styling lives in `forms-ui.ts`: `.mjf-row:has(.mjf-row-primary:focus-visible)` draws the row's
focus ring where `.mjf-row:focus-visible` draws it today, and `.mjf-row-primary` resets button
chrome so the title looks unchanged.

### Design it twice: the alternative considered

**Stretched link, CSS only.** The title's `::after` covers the row, and actions get
`position: relative; z-index: 1`.

| | Directive | Stretched link |
|---|---|---|
| Interface | one output | a CSS convention every action must follow (z-index) |
| Builder card (select, not navigate; cdkDrag) | works; drag release is filtered | overlay sits over the drag handle, so every builder control needs a z-index |
| Text selection in the row | preserved | blocked by the overlay |
| stopPropagation calls removed | all 11 | none (no longer needed for keys, still for clicks on actions under the overlay) |
| JS | about 40 lines with a spec | none |

The directive is deeper: more behaviour behind a smaller interface, and it serves all three
callers. The stretched link only works for the two navigation rows.

### Tests

`row-activate.directive.spec.ts` on a host template with a primary button, an action button,
a text span and a drag simulation. Activation fires for the span click only. It does not
fire for the action, a selection, or a 10px pointer move. The host gets no `tabindex`. axe
on the home and templates specs (or the live re-run) shows `nested-interactive` at 0.

### PR 2 commits

1. Add the directive and its spec (no caller).
2. Home and templates: remove `role="button" tabindex="0"`, make the title the primary button,
   and drop their stopPropagation calls.
3. Builder: question cards and screens. `selectQuestion` moves to the `.fb-q-label`
   button, and the eight stopPropagation calls go. This depends on `cdkDragHandle`
   (`:561`), which already limits drag start to the handle.

---

## Module 3: Explorer token layer and the gate that keeps it (F02, F04, F06)

### Problem

- **F02:** three rules use `var(--mj-brand-on-primary, var(--mj-text-inverse))`
  (`shared/forms-ui.ts:210`, `builder/form-builder.styles.ts:384`,
  `builder/conditional-rule-editor.component.ts:60`). MJ's dark theme defines
  `--mj-brand-on-primary` as `#fff` on `#4095d2`, so the fallback never applies and the
  result is 3.25:1.
- **F04:** `--mj-text-disabled` carries readable text in `.tg-card-meta`
  (`templates-gallery.styles.ts:71`, 1.93:1 in dark), `:78`, and `.rp-form-count.is-none`
  (`forms-reporting-dashboard.styles.ts:108`). It also colours the drag-handle glyph, a
  control that needs 3:1 (`form-builder.styles.ts:607`). Separately, tinted brand text
  fails at 4.18–4.48:1 (`.fb-page-target`, the Design preview screen label), and so does
  `.fb-q-num` at 4.3:1.
- **F06:** `.fb-q-handle` is 22×28 (`form-builder.styles.ts:602`) and the Analytics
  `.rp-alert-close` is 18×24.

### Interface

Explorer component CSS reads one Forms token for "text on the primary colour" and never the
MJ one directly:

```css
/* forms-ui.ts, in the scale block at :45-70 */
--mjf-on-primary: var(--mj-text-inverse);  /* MJ's --mj-brand-on-primary is #fff in dark (3.25:1). Switch here when MJ fixes it. */
```

When MJ fixes the token upstream, one line changes.

The gate in `scripts/check-ui-tokens.mjs` (`npm run lint:ui`, already in CI) gets one rule
table that reuses the existing `ui-gate: allow-… — reason` marker style:

| Rule | Fails on | Allowed when |
|---|---|---|
| `on-primary` | `--mj-brand-on-primary` in `packages/Angular/src/lib/**` outside `widget/` | never (use `--mjf-on-primary`) |
| `disabled-for-content` | `--mj-text-disabled` | the selector has `:disabled`, `[disabled]`, `[aria-disabled`, `::placeholder` or `.is-disabled`, or the line has `ui-gate: allow-disabled-token — <reason>` (for decorative glyphs) |

The rest is plain value fixes, not a module: `.tg-card-meta` and `.rp-form-count.is-none` go
to `--mj-text-muted`, and the handle glyph goes to `--mj-text-muted` at 24×40. `.fb-q-num`
goes to `--mj-text-secondary`. `.fb-page-target` and the preview label use
`--mj-brand-primary-hover` on their tint. `.rp-alert-close` gets 32×32. The decorative uses
(`.home-chevron`, `.qb-dot`, `.otp-dot`, empty-state icons) get the allow marker with a
reason.

The widget is untouched. It defines its own `--mj-brand-on-primary` in
`widget/mj-form.component.css:50` against its own light-only palette (F15, not in scope).

### Tests

- The gate has no tests today (only `.github/workflows/ui-gate.yml` runs it). Add a
  fixture test with a failing and a passing case for each new rule, plus one for the allow
  marker, so the rules themselves are verified.
- Contrast re-run with axe in light and dark on home, builder (every tab) and templates.
  Pass condition: 0 `color-contrast` nodes owned by Forms. The MJ shell nav item stays,
  as upstream.

### PR 3 commits

1. Gate rules only, with every existing violation marked. The run is green and shows the debt.
2. Token and value fixes, removing the markers that no longer apply.
3. A separate MJ issue (outside the PR) for dark `--mj-brand-on-primary`.

---

## Module 4: widget keyboard and question semantics (F03, F11)

### Correction to the audit first

F11 overstated the problem. Re-reading `widget/components/questions/form-question.component.html`:
SingleChoice, MultiChoice, Rating, NPS, YesNo, PictureChoice, OpinionScale and Legal **do**
render `role="radiogroup"`/`"group"` with `aria-labelledby` (`:55`, `:73`, `:106`, `:123`, `:138`,
`:249`, `:276`, `:400`). The real gaps:

1. `<label [attr.for]="inputId()">` (`:12`) is rendered for every type, but for groups,
   Matrix, Ranking and composites no element has that id, so the `for` points at nothing.
2. Groups never carry `aria-required`. "(required)" sits inside a label that is not
   associated with any control.
3. Matrix (`:344-372`): the `role="radio"` buttons have no per-row group, so there is no
   "1 of 4" and no arrow keys.
4. Address/ContactInfo (`:484-507`): sub-fields are not grouped under the question prompt,
   and `aria-describedby` drops the help text when the field is valid (`:501`).
5. Checkbox (`:390`): the visible label is `placeholder() || 'I agree'`.

The artifact will be corrected to match.

### Interface: one classification drives the template

```ts
/** How a question type is labelled and grouped for assistive tech. Exhaustive over the type union. */
export type QuestionShape = 'control' | 'group' | 'grid' | 'fieldset';
export function questionShape(type: FormQuestionType): QuestionShape;
```

It takes the widget's existing `FormQuestionType`, the same parameter as `inputModeFor` /
`inputTypeFor` / `autocompleteFor` in `widget/components/questions/input-mode.ts`. It lives
beside them, which is the precedent for a pure per-type decision. The `switch` has no
`default`, so a new type fails to compile until it is classified.

The template stops deciding per `@case` and branches once on the shape:

| Shape | Label element | Group element |
|---|---|---|
| `control` (text, number, dropdown, file, date/time) | `<label for=inputId>` | the input carries `aria-required` (already true) |
| `group` (choices, rating, NPS, yes/no, picture, scale, legal, ranking) | `<span class="mjf-question__label" id=labelId>` with no `for` | the existing group element, plus `aria-required` |
| `grid` (matrix) | `<span id=labelId>` | the table gets `aria-labelledby=labelId`. Each row becomes native `<input type="radio" name="{q}-{row}">` inside the cells, labelled "Row: Column" as today. Native radios give per-row grouping and arrow keys with no ARIA. |
| `fieldset` (address, contact info) | `<fieldset>` + `<legend>` with the prompt | each sub-field's `aria-describedby` always includes the help id, plus its error id when there is one |

Checkbox moves to `control`. Its visible label is the question prompt, and the placeholder
becomes help text.

### Interface: Enter to advance

```ts
/** True when Enter in `target` should move the respondent forward (one-question mode). */
export function advancesOnEnter(target: EventTarget | null): boolean;
```

It is true only for a text-like `<input>`: not checkbox, radio, file, button or submit. It is
false for a textarea, a button, an `a`, or any role=radio/checkbox/option/button element.
`form-one-question.component.ts:236-241` calls it and otherwise lets the event through, so
Back, a choice, Retry and "Choose a file" activate natively.

### Tests

- `question-shape.spec.ts`: every type maps to a shape, which the compiler also enforces.
- `form-question.component.spec.ts`, one case per shape: every `label[for]` resolves to an
  element, a required group exposes `aria-required="true"`, matrix rows are radio groups, and
  a composite field's describedby holds the help id.
- `form-one-question.component.spec.ts`: Enter on Back calls `onBack`, not `onNext`, and
  Enter on the last question's Back does not submit. Enter in a text input still advances.
  The repo's memory notes that this suite runs under the widget's no-zone setup, so the
  test must use the real event path.
- Live: the widget sections 2–4 that the audit could not reach. Use a disposable fixture
  form so Next/Submit write nothing shared (see Open questions).

### PR 4 commits

1. F03 alone (small, Critical, easy to revert): `advancesOnEnter` with its spec.
2. Refactor: `questionShape` plus the template branch on shape. Output is unchanged for every type
   except the dangling `for` (a no-behaviour refactor, verified by a DOM snapshot spec).
3. Behaviour: `aria-required` on groups, the matrix native radios, the composite fieldset,
   the Checkbox label.

---

## Order and size

| PR | Findings | Effort | Depends on |
|---|---|---|---|
| 4a (Enter) | F03 | S | none, ship first |
| 3 (tokens + gate) | F02, F04, F06 | S–M | none |
| 1 (dashboard failure) | F01, F10 | M | none |
| 2 (row directive) | F05 | M | none, and it touches the same builder file as PR 3's handle size; land 3 first |
| 4b (semantics) | F11 | M | 4a |

Each PR ships a `patch` changeset (no migration or metadata), per `.claude/rules/changesets.md`.

## Resolved after the first draft

1. **Matrix uses native radios per row:** `<input type="radio" name="{question}-{row}">`,
   styled like today's buttons. It is the one deliberate mix of native and `button role=radio`
   in the widget, chosen because the browser then supplies the grouping and the arrow keys.
2. **Live widget testing uses a throwaway form in `MJ_ATS_Dev`:** one form plus a distribution
   created for the test and deleted afterwards. Record the ids in the PR so the cleanup can
   be checked.
3. **F10 is folded into PR 1:** the home page gets three distinct states on the same failure
   path as `DashboardFailure`:
   - error, with Retry ("Couldn't load your forms. Check your connection, then Retry")
   - first run ("No forms yet" and New form)
   - all archived ("All N forms are archived" and Show archived)

   This adds a pure `homeListState(loading, failed, total, visible, query, showArchived)`
   selector beside `reportState`.
