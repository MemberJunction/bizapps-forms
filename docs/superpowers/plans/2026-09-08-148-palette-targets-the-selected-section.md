# Palette Click Targets the Selected Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A palette click puts its question in the section the author is pointing at, and the canvas says which section that is.

**Architecture:** The rule that picks the target page moves out of the component into a pure module (`new-question-target.ts`), gains the page-selection branch it never had, and returns the announcement copy alongside the page so the canvas can mark the destination. `form-builder.component.ts` calls it; the section header renders the announcement. No new placement UI, no change to `insertQuestionAt`.

**Tech Stack:** TypeScript, Angular 21 (standalone-style component with `templateUrl`, `inject()`), vitest in a **node** environment (no DOM — components cannot be instantiated; see `packages/Angular/vitest.config.ts`), CSS-in-a-`.styles.ts` string.

**Spec:** GitHub issue [MemberJunction/bizapps-forms#148](https://github.com/MemberJunction/bizapps-forms/issues/148) — "Selecting a section highlights it but does not target it".

## Reproduction on record (do not re-derive)

The four files the issue cites are byte-identical to `f599b41`, the commit its live repro ran against. The shipped rule, lifted verbatim out of `form-builder.component.ts` and run against a two-section form (`/private/tmp/.../scratchpad/repro-148.mjs`):

```
two-section form: page-1, page-2

nothing selected                   -> new question lands in page-2
section 1 header clicked           -> new question lands in page-2   <- the defect
section 2 header clicked           -> new question lands in page-2
question q-1 selected (in page-1)  -> new question lands in page-1
welcome screen selected            -> new question lands in page-2
no pages at all                    -> undefined (palette click is a no-op)
```

Root cause, one line: `targetPageForNewQuestion` (`form-builder.component.ts:639-652`) reads `this.selectedQuestionId` and nothing else, so the `page` kind of `BuilderSelection` — rendered as `is-selected` on the header since RULES_AND_BRANCHING_PLAN B2 — falls through to `pages[pages.length - 1]`.

## Global Constraints

- **No `any`.** No `as any`, `: any`, `<any>`, or `unknown` as a lazy stand-in (CLAUDE.md §2).
- **No hardcoded colours in CSS** — semantic `--mj-*` / `--mjf-*` tokens only; `ui-token-gate` is a required check.
- **The pure module stays free of Angular.** Type-only import of `PageNode`; no `inject()`, no decorators — this is what makes it testable in the node-environment suite, and is the reason `builder-selection.ts` exists at all.
- **Vitest specs here are `.spec.ts`**, colocated beside the source. There is no `test-utils` package.
- **`@if (pages.length > 1)` still governs the section header** — a one-section form gains no new chrome.
- **`insertQuestionAt` and `state.addQuestion` are not touched.** Default placement stays append-to-bottom.
- **Changeset level: `patch`** — this ships no migration and no metadata (`.claude/rules/changesets.md`).
- **Never hand-edit anything under `src/**/generated/`.** Nothing in this change goes near it.
- Branch `fix/148-palette-targets-selected-section`, cut from `origin/next`, tracking its own remote.

## File Structure

| File | Responsibility |
|---|---|
| `packages/Angular/src/lib/builder/new-question-target.ts` | **Create.** The whole targeting rule, pure: `targetPageFor(selection, pages)` → the page a palette click writes to plus the words the canvas uses to say so. |
| `packages/Angular/src/lib/builder/new-question-target.spec.ts` | **Create.** Unit tests over all four selection kinds, the stale-question branch, the empty tree and the "fallback is unreachable while a section is selected" property. |
| `packages/Angular/src/lib/builder/form-builder.component.ts` | **Modify.** Delete the private rule; `addQuestion` consumes `targetPageFor`; add one `addingHere` getter for the template. |
| `packages/Angular/src/lib/builder/form-builder.component.html` | **Modify.** `@let` the target once above the page loop; mark the target header and render the announcement inside the existing `@if (pages.length > 1)` block. |
| `packages/Angular/src/lib/builder/form-builder.styles.ts` | **Modify.** One `.fb-page-target` pill rule, tokens only. |
| `packages/Angular/src/lib/builder/add-target.wiring.spec.ts` | **Create.** Proves the component and template actually consume the rule — the shipped `addQuestion` targeting expression and the header's announcement condition are lifted out of the real sources and run, the idiom `reorder-affordance.wiring.spec.ts` established. |
| `.changeset/*.md` | **Create.** `patch` bump for `@mj-biz-apps/forms-ng`. |

---

### Task 1: The targeting rule, as a pure module

**Files:**
- Create: `packages/Angular/src/lib/builder/new-question-target.ts`
- Test: `packages/Angular/src/lib/builder/new-question-target.spec.ts`

**Interfaces:**
- Consumes: `BuilderSelection` from `./builder-selection`; `PageNode` from `./builder-models` (both type-only).
- Produces:
  - `export interface NewQuestionTarget { readonly page: PageNode; readonly notice: string | null }`
  - `export function targetPageFor(selection: BuilderSelection, pages: readonly PageNode[]): NewQuestionTarget | null`
  - `export const ADDING_HERE = 'Adding here'`
  - `export const ADDING_TO_LAST = 'Adding to the last section'`

The `notice` is `null` for exactly one case — nothing selected — which is the case where the author has expressed no intent to confirm. Every other kind produces words, including `screen`, whose target is the last page and must not be silent about it (issue AC 7).

- [ ] **Step 1: Write the failing test**

Create `packages/Angular/src/lib/builder/new-question-target.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NOTHING_SELECTED, selectPage, selectQuestion, selectScreen } from './builder-selection';
import type { PageNode } from './builder-models';
import { ADDING_HERE, ADDING_TO_LAST, targetPageFor } from './new-question-target';

/**
 * A page with just the two fields the rule reads. The real `PageNode` carries a loaded entity;
 * the rule only ever looks at ids, so a cast at the seam keeps the fixture honest about that.
 */
const page = (id: string, questionIds: readonly string[]): PageNode =>
  ({
    entity: { ID: id },
    questions: questionIds.map((qid) => ({ entity: { ID: qid } })),
  }) as unknown as PageNode;

const pages: readonly PageNode[] = [page('page-1', ['q-1']), page('page-2', ['q-2'])];

describe('where a palette click puts its question', () => {
  it('uses the section whose header the author selected', () => {
    // THE DEFECT (#148). The canvas highlights the clicked header, and the old rule — which read
    // only the question selection — sent the question to the last page anyway.
    expect(targetPageFor(selectPage('page-1'), pages)?.page.entity.ID).toBe('page-1');
    expect(targetPageFor(selectPage('page-2'), pages)?.page.entity.ID).toBe('page-2');
  });

  it('never falls back to the last section while a section is selected', () => {
    // The property, not the two examples above: whichever section is selected is the target.
    for (const target of pages) {
      const chosen = targetPageFor(selectPage(target.entity.ID), pages);
      expect(chosen?.page.entity.ID).toBe(target.entity.ID);
      expect(chosen?.notice).toBe(ADDING_HERE);
    }
  });

  it('still appends to the selected question’s section', () => {
    const chosen = targetPageFor(selectQuestion('q-1'), pages);
    expect(chosen?.page.entity.ID).toBe('page-1');
    expect(chosen?.notice).toBe(ADDING_HERE);
  });

  it('falls back to the last section when nothing is selected, and says nothing', () => {
    const chosen = targetPageFor(NOTHING_SELECTED, pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBeNull();
  });

  it('says so when a selected screen leaves the last section as the target', () => {
    // A welcome/ending screen is not on any page. The target is the fallback — the author is
    // told that in words rather than discovering it after the question appears.
    const chosen = targetPageFor(selectScreen('screen-1'), pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBe(ADDING_TO_LAST);
  });

  it('says so when the selected question is no longer on any page', () => {
    const chosen = targetPageFor(selectQuestion('deleted-q'), pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBe(ADDING_TO_LAST);
  });

  it('has no target at all on a form with no pages', () => {
    expect(targetPageFor(selectPage('page-1'), [])).toBeNull();
    expect(targetPageFor(NOTHING_SELECTED, [])).toBeNull();
  });

  it('targets the only section of a one-section form, whatever is selected', () => {
    const single = [page('only', ['q-1'])];
    expect(targetPageFor(NOTHING_SELECTED, single)?.page.entity.ID).toBe('only');
    expect(targetPageFor(selectPage('only'), single)?.page.entity.ID).toBe('only');
    expect(targetPageFor(selectQuestion('q-1'), single)?.page.entity.ID).toBe('only');
  });

  it('ignores a page selection whose page is gone', () => {
    const chosen = targetPageFor(selectPage('deleted-page'), pages);
    expect(chosen?.page.entity.ID).toBe('page-2');
    expect(chosen?.notice).toBe(ADDING_TO_LAST);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/Angular && pnpm exec vitest run src/lib/builder/new-question-target.spec.ts
```
Expected: FAIL — `Failed to resolve import "./new-question-target"`.

(If instead every spec file in the package fails to collect with `Failed to resolve entry for package "@mj-biz-apps/forms-entities"`, the worktree has no `packages/Entities/dist`: run `pnpm --filter @mj-biz-apps/forms-entities run build` once.)

- [ ] **Step 3: Write the module**

Create `packages/Angular/src/lib/builder/new-question-target.ts`:

```ts
import type { BuilderSelection } from './builder-selection';
import type { PageNode } from './builder-models';

/**
 * Where a palette click puts its question, and what the canvas says about it.
 *
 * THE DEFECT THIS EXISTS FOR (#148). The rule used to be a private method that read the question
 * selection and nothing else, so clicking a section header highlighted one section and wrote to
 * another — the builder rendered a `page` selection it never consulted. A private method on a
 * component also could not be tested: this package's vitest runs in a node environment where the
 * builder, with its `inject()` and `templateUrl`, cannot be instantiated. That is the same reason
 * `builder-selection.ts` is a module rather than a pair of fields.
 *
 * The notice travels WITH the page deliberately. "Which section" and "what do we tell the author"
 * are one decision — the fallback is only acceptable while it is visible — and answering them in
 * two places is how the highlight and the destination came to disagree in the first place.
 */
export interface NewQuestionTarget {
  readonly page: PageNode;
  /** What the target section's header announces, or null to announce nothing. */
  readonly notice: string | null;
}

/** The author pointed at this section (directly, or at a question inside it). */
export const ADDING_HERE = 'Adding here';

/** The author pointed at something that is not a section, so the last one takes it. */
export const ADDING_TO_LAST = 'Adding to the last section';

/**
 * The section a new question from the palette belongs to.
 *
 * Order: the selected section, then the selected question's section, then the last section. Null
 * only when there is no section to put anything in, which is a palette click the caller drops.
 */
export function targetPageFor(
  selection: BuilderSelection,
  pages: readonly PageNode[],
): NewQuestionTarget | null {
  if (pages.length === 0) {
    return null;
  }
  const chosen = chosenPage(selection, pages);
  if (chosen) {
    return { page: chosen, notice: ADDING_HERE };
  }
  const last = pages[pages.length - 1];
  // A selection that resolves to no section still gets an answer — it just gets told which one.
  return { page: last, notice: selection.kind === 'none' ? null : ADDING_TO_LAST };
}

/** The section the selection points at, or undefined when it points at none. */
function chosenPage(selection: BuilderSelection, pages: readonly PageNode[]): PageNode | undefined {
  switch (selection.kind) {
    case 'page':
      return pages.find((p) => p.entity.ID === selection.id);
    case 'question':
      return pages.find((p) => p.questions.some((q) => q.entity.ID === selection.id));
    case 'screen':
    case 'none':
      // A screen belongs to no page, so there is nothing here to choose; the caller announces it.
      return undefined;
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd packages/Angular && pnpm exec vitest run src/lib/builder/new-question-target.spec.ts
```
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/Angular/src/lib/builder/new-question-target.ts packages/Angular/src/lib/builder/new-question-target.spec.ts
git commit -m "test(builder): pin the section a palette click should target"
```

---

### Task 2: The builder consumes the rule and marks the target

**Files:**
- Modify: `packages/Angular/src/lib/builder/form-builder.component.ts` (`addQuestion` ~520, delete `targetPageForNewQuestion` ~638-652, add one getter)
- Modify: `packages/Angular/src/lib/builder/form-builder.component.html` (the `@let badges` line ~356 and the `.fb-page-head` block ~363-385)
- Modify: `packages/Angular/src/lib/builder/form-builder.styles.ts` (beside `.fb-page-head.is-selected`, ~379)
- Test: `packages/Angular/src/lib/builder/add-target.wiring.spec.ts`

**Interfaces:**
- Consumes: `targetPageFor`, `NewQuestionTarget`, `ADDING_HERE`, `ADDING_TO_LAST` from Task 1.
- Produces: `protected get addingHere(): NewQuestionTarget | null` on the component; class `is-add-target` and element `.fb-page-target` on the section header.

- [ ] **Step 1: Write the failing wiring test**

Create `packages/Angular/src/lib/builder/add-target.wiring.spec.ts`:

```ts
/**
 * That the builder actually USES the targeting rule, and that the canvas marks what it picks.
 *
 * WHY THIS SPEC READS AND RUNS SOURCE. The component uses `inject()` and `templateUrl` and cannot
 * be instantiated in this suite's node environment, so the checked-in template is what there is to
 * check — the approach `reorder-affordance.wiring.spec.ts` takes for a binding. A string match
 * would assert a spelling; the acceptance criterion is a behaviour ("the header the author
 * selected is the one that says Adding here"), so the real expression is lifted out of the real
 * template and RUN against a real two-section form. The files are this repo's own sources, read
 * off disk in a test process; nothing here comes from a request.
 *
 * Comments are stripped first: both files explain this decision in prose, and a guard that
 * matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTHING_SELECTED, selectPage, selectScreen } from './builder-selection';
import type { PageNode } from './builder-models';
import { ADDING_HERE, ADDING_TO_LAST, targetPageFor } from './new-question-target';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const component = (): string => stripped('form-builder.component.ts');
const template = (): string => stripped('form-builder.component.html');

const page = (id: string, questionIds: readonly string[]): PageNode =>
  ({
    entity: { ID: id },
    questions: questionIds.map((qid) => ({ entity: { ID: qid } })),
  }) as unknown as PageNode;

const pages: readonly PageNode[] = [page('page-1', ['q-1']), page('page-2', ['q-2'])];

/** The `@if` condition guarding the announcement, lifted out of the template and compiled. */
function announcementCondition(): (scope: { addTarget: unknown; page: PageNode }) => boolean {
  const html = template();
  const marker = html.indexOf('fb-page-target');
  expect(marker, 'the header no longer renders an .fb-page-target announcement').toBeGreaterThan(0);
  const before = html.slice(0, marker);
  const opened = before.lastIndexOf('@if (');
  const condition = before.slice(opened + '@if ('.length, before.lastIndexOf(')'));
  return new Function('scope', `with (scope) { return (${condition}); }`) as never;
}

describe('the builder writes where it says it writes', () => {
  it('asks the shared rule for the target instead of keeping its own', () => {
    const src = component();
    expect(src).toContain('targetPageFor(');
    expect(
      src,
      'the private rule is back — two answers to one question is exactly the defect',
    ).not.toContain('private targetPageForNewQuestion');
  });

  it('adds the question to the page the rule returned', () => {
    // `addQuestion` must push into the SAME node it created against, or the canvas and the
    // database disagree about which section holds the question.
    const body = component().slice(component().indexOf('protected async addQuestion('));
    const untilNextMember = body.slice(0, body.indexOf('\n  protected '));
    expect(untilNextMember).toContain('target.page');
    expect(untilNextMember).not.toContain('targetPageForNewQuestion()');
  });

  it('announces on the section the rule picked, and nowhere else', () => {
    const condition = announcementCondition();
    const addTarget = targetPageFor(selectPage('page-1'), pages);
    expect(condition({ addTarget, page: pages[0] })).toBe(true);
    expect(condition({ addTarget, page: pages[1] })).toBe(false);
  });

  it('announces nothing when nothing is selected', () => {
    // AC: the affordance is absent when the author has selected nothing at all, even though the
    // rule still resolves a page for the click to land in.
    const condition = announcementCondition();
    const addTarget = targetPageFor(NOTHING_SELECTED, pages);
    expect(addTarget?.page.entity.ID).toBe('page-2');
    expect(condition({ addTarget, page: pages[1] })).toBe(false);
  });

  it('announces the fallback when a screen is selected', () => {
    const condition = announcementCondition();
    const addTarget = targetPageFor(selectScreen('s-1'), pages);
    expect(condition({ addTarget, page: pages[1] })).toBe(true);
    expect(addTarget?.notice).toBe(ADDING_TO_LAST);
  });

  it('keeps the announcement inside the multi-section header, so one-section forms gain nothing', () => {
    const html = template();
    const guard = html.indexOf('@if (pages.length > 1)');
    const head = html.indexOf('fb-page-head');
    const target = html.indexOf('fb-page-target');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(head);
    expect(head).toBeLessThan(target);
  });

  it('styles the announcement with design tokens only', () => {
    const css = stripped('form-builder.styles.ts');
    const rule = css.slice(css.indexOf('.fb-page-target'));
    const block = rule.slice(0, rule.indexOf('}') + 1);
    expect(block).toContain('var(--mj');
    expect(block, 'hardcoded colours break dark mode').not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it('uses the rule’s own copy rather than retyping it', () => {
    expect(ADDING_HERE).toBe('Adding here');
    expect(template(), 'the copy belongs to the rule that decides when it applies').not.toContain(
      'Adding here',
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/Angular && pnpm exec vitest run src/lib/builder/add-target.wiring.spec.ts
```
Expected: FAIL — first assertion, `expected '…' to contain 'targetPageFor('`, and the announcement lift fails with "the header no longer renders an .fb-page-target announcement".

- [ ] **Step 3: Point the component at the rule**

In `form-builder.component.ts`, add to the existing import block near `./builder-selection`:

```ts
import { type NewQuestionTarget, targetPageFor } from './new-question-target';
```

Replace the body of `addQuestion` (the `const page = this.targetPageForNewQuestion();` lines) with:

```ts
  protected async addQuestion(type: FormQuestionType): Promise<void> {
    if (!this.tree || this.busy) {
      return;
    }
    const target = targetPageFor(this.selection, this.pages);
    if (!target) {
      return;
    }
    this.busy = true;
    const node = await this.state.addQuestion(this.tree, target.page, type, this.defaultPrompt(type));
    if (node) {
      target.page.questions.push(node);
      // Selecting the new question is what clears any screen selection. The author asked for a
      // question; the pane has to show them the question they just got.
      this.selection = questionSelection(node.entity.ID);
      this.markDirty();
    }
    this.busy = false;
    this.cdr.markForCheck();
  }
```

Delete the whole `targetPageForNewQuestion` method, its doc comment included (`form-builder.component.ts:638-652`).

Add the template's single read, beside the other canvas getters (near `protected get pages()`):

```ts
  /**
   * The section a palette click would write to, for the canvas to mark.
   *
   * Read once per change-detection pass through the template's `@let`, not per page: the answer
   * is the same for every header, and the header that matches is the one that announces it.
   */
  protected get addingHere(): NewQuestionTarget | null {
    return targetPageFor(this.selection, this.pages);
  }
```

- [ ] **Step 4: Mark the target on the canvas**

In `form-builder.component.html`, beside the existing `@let badges = ruleBadges;` (~line 356), add:

```html
          <!-- One read for the whole loop: which section a palette click writes to, and the words
               for it. A getter per header would answer the same question once per section. -->
          @let addTarget = addingHere;
```

Then in the `.fb-page-head` element, add the class binding after `[class.is-selected]`:

```html
                [class.is-add-target]="addTarget !== null && addTarget.notice !== null && addTarget.page.entity.ID === page.entity.ID"
```

And immediately after the `<input #pageTitle class="fb-page-title" …/>` element — so the pill reads after the section title rather than shouldering the number aside — add the announcement:

```html
                @if (addTarget !== null && addTarget.notice !== null && addTarget.page.entity.ID === page.entity.ID) {
                  <span class="fb-page-target">{{ addTarget.notice }}</span>
                }
```

- [ ] **Step 5: Style the announcement**

In `form-builder.styles.ts`, immediately after the `.fb-page-head.is-selected .fb-page-num { … }` rule:

```css
.fb-page-head.is-add-target { border-bottom-color: var(--mj-brand-primary); }
.fb-page-target {
  flex: none;
  font-size: var(--mjf-label);
  color: var(--mj-brand-primary);
  background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
  border-radius: var(--mjf-radius-sm);
  padding: 2px 8px;
  white-space: nowrap;
}
```

- [ ] **Step 6: Run the wiring test and the whole builder suite**

```bash
cd packages/Angular && pnpm exec vitest run src/lib/builder/
```
Expected: PASS, including `add-target.wiring.spec.ts` and `new-question-target.spec.ts`.

- [ ] **Step 7: Typecheck — the suite never compiles the component**

```bash
cd packages/Angular && pnpm run typecheck && pnpm run build
```
Expected: both clean. A green vitest run proves nothing about the component or its template; `ngc` inside `build` is what compiles the `@if`/`@let` added above.

- [ ] **Step 8: Commit**

```bash
git add packages/Angular/src/lib/builder/
git commit -m "fix(builder): a palette click writes to the section the author selected"
```

---

### Task 3: Changeset and full-package verification

**Files:**
- Create: `.changeset/<two-words>.md`

- [ ] **Step 1: Write the changeset**

```md
---
'@mj-biz-apps/forms-ng': patch
---

fix(builder): a palette click adds its question to the selected section

The canvas highlighted the section header the author clicked and then wrote the new question to
the last section anyway — the targeting rule read only the question selection and never the page
selection it rendered. The rule is now a pure, unit-tested module, and the destination section
says "Adding here" so it is never inferred from invisible state.
```

`patch`, not `minor`: this ships no migration and no metadata (`.claude/rules/changesets.md`).

- [ ] **Step 2: Run the package's full suite one last time**

```bash
cd packages/Angular && pnpm test
```
Expected: all files pass. (A fresh worktree needs `pnpm --filter @mj-biz-apps/forms-entities run build` first, or 38 files fail to collect for a missing `dist`.)

- [ ] **Step 3: Commit and push**

```bash
git add .changeset
git commit -m "chore(changeset): patch — no migration, no metadata"
git push -u origin fix/148-palette-targets-selected-section
```

---

## Acceptance criteria → where they are met

| Issue AC | Met by |
|---|---|
| Palette click puts the question in the highlighted section | Task 1 `chosenPage` `case 'page'`; Task 2 `addQuestion`; tested in `new-question-target.spec.ts` "uses the section whose header the author selected" |
| With a question selected, still the bottom of that question's section | `case 'question'`; test "still appends to the selected question's section" |
| Nothing selected → last section, and unreachable while a section is highlighted | `targetPageFor` fallback; tests "falls back … when nothing is selected" and "never falls back … while a section is selected" |
| Pure exported function, unit tests over question / screen / page / none + empty tree | Task 1 in full — nine tests |
| Visible "adding here" affordance, absent when nothing is selected | Task 2 `@if`, `.fb-page-target`; wiring tests "announces on the section the rule picked" and "announces nothing when nothing is selected" |
| Single-page forms unchanged | The announcement sits inside `@if (pages.length > 1)`; wiring test "keeps the announcement inside the multi-section header" |
| A `screen` selection does not silently target the last page | `ADDING_TO_LAST`; tests "says so when a selected screen…" and "announces the fallback when a screen is selected" |
| Default placement stays append-to-bottom; `insertQuestionAt` untouched | No task touches it; `page.questions.push` retained in `addQuestion` |

## Deliberately not in scope

- **Drag from the palette with a drop indicator.** Needs a `cdkDropListGroup` joining the palette to every section list — the same wiring cross-section drag needs (#149, PR #183 open). Building that connection twice is the thing to avoid.
- **Placement UI beyond append-to-bottom.** The gutter seam (`insertQuestionAt`) and #147's empty-state control already serve position.
- **`addPage()` changing the selection.** Making a new section auto-selected would fix row 1 of the issue's table by a different route; it also changes what the properties pane shows the moment a section is created, which is a separate UX decision and a separate issue.
