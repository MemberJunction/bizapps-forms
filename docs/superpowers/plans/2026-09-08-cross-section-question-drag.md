# Cross-Section Question Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A question can be dragged from any section of the form builder into any other section, at any position, in either direction — and every ordering, rule-damage, persistence and undo behaviour that works today for a within-section drag keeps working across the new boundary.

**Architecture:** Each section renders its own `cdkDropList` and the lists are not connected, so CDK has nothing to transfer between. The fix connects them with a single `cdkDropListGroup` on the canvas, rebinds `[cdkDropListData]` from `page.questions` to the whole `PageNode` (so the *source* page is reachable from the drop event), and branches `dropQuestion` on `event.previousContainer === event.container`. All the decisions the new branch needs — is this move legal, what did it break, where does Undo put it back — are added as **pure functions in `reorder.ts`** beside the ones the in-page drag already uses, because `form-builder.component.ts` uses `inject()` + `templateUrl` and cannot be instantiated in this package's node test environment. The component stays a thin caller; the specs test the functions.

**Tech Stack:** Angular 21 standalone components, `@angular/cdk/drag-drop`, MemberJunction `BaseEntity` persistence, Vitest (node environment, `.spec.ts`, no DOM).

**Spec:** [GitHub issue #149](https://github.com/MemberJunction/bizapps-forms/issues/149) — read it in full before Task 1. Siblings: #147, #148.

**Worktree:** `/Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-149`
**Branch:** `feat/149-cross-section-question-drag` (cut from `origin/next` @ `e233fec`; upstream deliberately unset — see Global Constraints)

---

## Global Constraints

Copied from `CLAUDE.md`, `.claude/rules/*` and the issue. Every task's requirements implicitly include this section.

- **All work happens in the worktree above.** `pnpm install` has already been run there, `.env` copied in and `apps/MJAPI/.env` symlinked. Never run `pnpm install` at `/Users/sohamdesai/Projects/mj-dev/bizapps-forms` or anywhere under `mj-dev` other than this worktree.
- **Baseline is green and recorded:** `packages/Angular` → **114 test files, 1645 tests, 0 failures**. `packages/Entities` must be built (`cd packages/Entities && pnpm run build`) before `packages/Angular`'s suite will run — it already has been, but re-run it after any `git clean`.
- **NO `any` TYPES — EVER.** No `as any`, `: any`, `<any>`, no `unknown` as a lazy substitute. No `BaseEntity.Get()`/`.Set()` as a substitute for generated types.
- **NO COMMITS WITHOUT EXPLICIT APPROVAL.** Each task ends with a *prepared* commit: stage the files and write the message, then **stop and ask** before running `git commit`. Do not run `git push` at all in this plan.
- **The branch must not track `origin/next`.** Its upstream is currently unset on purpose. When the branch is eventually pushed it must be `git push -u origin feat/149-cross-section-question-drag`. Verify with `git branch -vv` before any push.
- **Changeset bump level is `patch`.** This change ships no `migrations/**.sql` and no `metadata/**`. Every package sits in one fixed changeset group, so a `minor` here would move all four packages for nothing (`.claude/rules/changesets.md`).
- **Never hand-edit anything under `packages/*/src/**/generated/**`.** Nothing in this plan needs to; `.claude/hooks/block-generated-edits.mjs` will refuse it anyway.
- **CSS uses semantic `--mj-*` / `--mjf-*` design tokens — no hardcoded colours.** Lengths are fine.
- **`RunView` / `Save()` / `Delete()` never throw — check the boolean** and read `LatestResult.CompleteMessage` on failure. `BuilderStateService.saveChecked` already does this; use it.
- **Never swallow an error.** Every failure path logs with context (what we were doing, for which question/page) or returns a failure result.
- **Tests are `.spec.ts`, colocated, Vitest, node environment.** `@memberjunction/test-utils` is not installed here — hand-roll fakes, following the pattern in `builder-state.save.spec.ts`.
- **Describe-block convention in this package:** where a spec has more than a handful of cases, group them `describe('happy')` / `describe('edge')` / `describe('worst')` — see `read-horizon.equivalence.spec.ts`.
- **Comments capture the non-obvious *why*.** This codebase's builder files are written that way and reviewers hold new code to it. A comment that restates the code is worse than none. Update or delete any comment you invalidate.
- **The drag is never blocked.** Every position in every section is a legal drop target. A move that breaks a rule raises the existing warning band; it is not refused. Publish already refuses while any rule is broken (`publish.service.ts:128-134`) and that is the gate — not the drag.

### Run commands (from the worktree root unless stated)

```bash
cd packages/Angular && npx vitest run src/lib/builder/reorder.spec.ts          # one spec
cd packages/Angular && pnpm test                                              # the package suite
cd packages/Angular && pnpm run typecheck                                     # tsc with specs included
pnpm run build:packages                                                       # ngc — the only thing that checks the template
```

`pnpm run typecheck` is the only thing that compiles a spec file, and `pnpm run build:packages` (ngc, `strictTemplates`) is the only thing that compiles the template. **Both must be run** — the package's `vitest` suite compiles neither.

---

## File Structure

| File | Change | Responsibility after the change |
|---|---|---|
| `packages/Angular/src/lib/builder/reorder.ts` | **Modify** | Every pure decision about a reorder — legality, damage diff, notice text, undo resolution — for both the in-page and the cross-page move. Gains `isValidCrossPageMove`, `UndoMove`, `ReorderNotice.fromPageId`, and a generalised `undoReorderMove`. |
| `packages/Angular/src/lib/builder/reorder.spec.ts` | **Modify** | Unit + property tests for the above. The "only rules on the moved page can newly break" canary is reframed, not deleted. |
| `packages/Angular/src/lib/builder/builder-state.service.ts` | **Modify** | The persistence seam. Gains `persistCrossPageMove` — the one method that knows the write ORDER that makes a partial failure survivable. |
| `packages/Angular/src/lib/builder/builder-state.cross-page-move.spec.ts` | **Create** | Proves the write order, the skip-the-moved-question interaction with `persistQuestionOrder`, and the failure surfacing. |
| `packages/Angular/src/lib/builder/form-builder.component.ts` | **Modify** | Thin caller: branch the drop, call the pure functions, call the state service, raise the band, mark dirty. |
| `packages/Angular/src/lib/builder/form-builder.component.html` | **Modify** | `cdkDropListGroup` on the canvas; `[cdkDropListData]="page"`. |
| `packages/Angular/src/lib/builder/form-builder.styles.ts` | **Modify** | `.fb-q-list` gains a `min-height` so an empty section is a droppable target. |
| `packages/Angular/src/lib/builder/rule-badges.wiring.spec.ts` | **Modify** | The tripwire is **replaced** by an assertion that the new write is covered by the damage diff. |
| `packages/Angular/src/lib/builder/read-horizon.equivalence.spec.ts` | **Modify** | The frozen oracle gains cross-page-move cases, including a move that empties a section and a move into the empty one. |
| `.changeset/<name>.md` | **Create** | `patch` for `@mj-biz-apps/forms-ng`. |

---

## Design decisions locked before Task 1

Read these; several tasks depend on them and none is re-derivable from the code alone.

### D1 — Why `isValidCrossPageMove` is not `isValidReorder`

`isValidReorder(from, to, length)` requires `from !== to` and `to < length`, because both indices address the **same** list. A cross-page move's two indices address **different** lists, so:

- `from` must be a real index of the source list: `0 <= from < sourceLength`.
- `to` addresses the destination list *after* the item has been removed from the source, so **`to === destinationLength` is legal** — that is "drop at the end", and it is the only way to append. `isValidReorder` would reject it.
- `from === to` carries no meaning at all and must not be rejected. Moving question 0 of section 1 to position 0 of section 2 is an ordinary move.

Reusing `isValidReorder` here silently forbids appending to a section and forbids a whole diagonal of legal moves. It gets its own function.

### D2 — Write order, and why a partial failure cannot orphan a question

The issue asks for an explicit answer. There is no transaction: this is N+M+1 single-row `Save()` calls. The answer is **ordering**, not rollback.

The order is: **(1) the moved question's `PageID` + its new `DisplayOrder`, in ONE `Save()`. (2) renumber the destination page. (3) renumber the source page.**

Why that order makes every partial failure survivable:

| Fails at | State on disk | Is it consistent? |
|---|---|---|
| (1) | Exactly the pre-move state. Nothing else was written. | Yes — the move simply did not happen. |
| during (2) | Moved question belongs to the destination at its final index; some of the destination's other rows renumbered, some not; the source has a numbering *gap* where the question used to be. | Yes — a question belongs to exactly one page, and `loadTree` sorts by `DisplayOrder`, so duplicates and gaps affect *order within one page*, never membership. |
| during (3) | Destination fully correct; source has a gap. | Yes — gaps are invisible: `sortQuestions` only compares. |

So **"orphaned between sections" is unrepresentable**: `PageID` is one column on one row, written by one `Save()`, and it holds either the old page or the new one. The worst outcome is a wrong *order within one page*, which the next reorder or reload corrects.

**Membership goes first, and alone**, because it is the only write that cannot be re-derived from what is on screen. `DisplayOrder` can be re-asserted by any later reorder; `PageID` cannot be guessed.

**Do NOT roll the in-memory tree back on failure.** The neighbouring `reorderQuestion` does not, and for the same reason: the screen keeps showing what the author did, `state.lastFailure()` tells them the database refused, and a reload re-asserts the truth. A rollback would need writes of its own, which can also fail, and would introduce a second, inconsistent answer to "what happens when a write is refused" in a file that already has one.

### D3 — Why the moved question needs its own `Save()` and cannot ride on `persistQuestionOrder`

`persistQuestionOrder` **skips any question whose `DisplayOrder` already matches its array index**. A question moved from index 1 of section 1 to index 1 of section 2 has an unchanged `DisplayOrder`, so `persistQuestionOrder` would write nothing at all — and `PageID` would never reach the database. The question would silently snap back to its old section on the next reload.

The flip side is a bonus: because step (1) sets `DisplayOrder` to its final value, step (2)'s `persistQuestionOrder(destination)` **skips the moved question**, so it is never written twice. Say so in a comment; it looks like an omission otherwise.

### D4 — The undo off-by-one, which differs between an in-page and a cross-page move

`ReorderNotice.wasBefore` is an **anchor** — the question the moved one used to sit immediately in front of — not an index. `destination()` in `reorder.ts` currently corrects for one thing:

> `moveItemInArray` splices OUT and then IN, so the anchor has already shifted down by one by the time the insert happens if it sat after the question.

**That correction is wrong for a cross-page undo.** The splice-out happens in the page the question is on *now*; the insert happens in the page it is going *home* to. They are different arrays, so the home page's indices do not shift when the question is removed from the other one. Applying `anchor - 1` across pages puts the question one position too early — a silent off-by-one that only shows up on a form where the anchor sat after the question, which is most of them.

Same reasoning for `wasBefore === null` ("it was last on its page"):

- in-page: home index is `length - 1` (the array shrank by one on removal),
- cross-page: home index is `length` (it did not).

`transferArrayItem` accepts `index === length`. This is why `undoReorderMove` must know whether the notice crossed a page, and it learns that from `notice.pageId !== notice.fromPageId` — data the notice already has to carry.

### D5 — An empty section must be a droppable target

`.fb-q-list` is `display: flex; flex-direction: column; gap: 10px` with no minimum height. An empty section's list is therefore **zero pixels tall** and CDK can never register a pointer as being over it, so the one case the issue's oracle calls "load-bearing" — an empty section — would still refuse every drop after the lists are connected. Giving `.fb-q-list` a `min-height` is part of the fix, not polish.

The `fb-canvas-empty` prompt renders *above* the list (`form-builder.component.html:425-430`), so it does not fill it.

---

### Task 1: `isValidCrossPageMove` — the legality guard

**Files:**
- Modify: `packages/Angular/src/lib/builder/reorder.ts` (append after `isValidReorder`, around `:21`)
- Test: `packages/Angular/src/lib/builder/reorder.spec.ts` (append a `describe` after the `isValidReorder` block, around `:37`)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function isValidCrossPageMove(from: number, sourceLength: number, to: number, destinationLength: number): boolean`

- [ ] **Step 1: Write the failing test**

Append to `packages/Angular/src/lib/builder/reorder.spec.ts`, immediately after the closing `});` of the `describe('isValidReorder', ...)` block, and add `isValidCrossPageMove` to the existing `import { ... } from './reorder';` list at the top of the file:

```ts
describe('isValidCrossPageMove', () => {
  describe('happy', () => {
    it('accepts a move into the middle of another section', () => {
      expect(isValidCrossPageMove(1, 3, 1, 2)).toBe(true);
    });

    it('accepts identical indices, which mean nothing across two lists', () => {
      // `isValidReorder` rejects from === to because both index ONE list. Position 0 of
      // section 1 and position 0 of section 2 are different places.
      expect(isValidCrossPageMove(0, 3, 0, 2)).toBe(true);
    });
  });

  describe('edge', () => {
    it('accepts a drop at the END of the destination, which is index === length', () => {
      // `to` addresses the destination AFTER the removal from the source, so appending is
      // index === length. Rejecting it would make "drop below the last question" impossible,
      // which is the most common cross-section drop there is.
      expect(isValidCrossPageMove(0, 2, 2, 2)).toBe(true);
    });

    it('accepts a move into an EMPTY destination section', () => {
      expect(isValidCrossPageMove(0, 1, 0, 0)).toBe(true);
    });

    it('accepts emptying the source section', () => {
      expect(isValidCrossPageMove(0, 1, 0, 3)).toBe(true);
    });
  });

  describe('worst', () => {
    it('rejects a source index past the end of the source', () => {
      expect(isValidCrossPageMove(3, 3, 0, 2)).toBe(false);
    });

    it('rejects a destination index past the append position', () => {
      expect(isValidCrossPageMove(0, 3, 3, 2)).toBe(false);
    });

    it('rejects negative indices', () => {
      expect(isValidCrossPageMove(-1, 3, 0, 2)).toBe(false);
      expect(isValidCrossPageMove(0, 3, -1, 2)).toBe(false);
    });

    it('rejects everything out of an empty source', () => {
      expect(isValidCrossPageMove(0, 0, 0, 2)).toBe(false);
    });

    it('rejects non-integer indices', () => {
      expect(isValidCrossPageMove(0.5, 3, 1, 2)).toBe(false);
      expect(isValidCrossPageMove(0, 3, 1.5, 2)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/Angular && npx vitest run src/lib/builder/reorder.spec.ts`
Expected: FAIL — `isValidCrossPageMove is not a function` (or a transform error on the unresolved named import).

- [ ] **Step 3: Write minimal implementation**

Append to `packages/Angular/src/lib/builder/reorder.ts`, directly below `isValidReorder`:

```ts
/**
 * Whether a proposed move BETWEEN two pages is a real, in-bounds move (issue #149).
 *
 * Deliberately not {@link isValidReorder}, and the difference is not cosmetic. That one's two
 * indices address ONE list, so it rejects `from === to` and requires `to < length`. Here they
 * address different lists:
 *
 *  - `from` indexes the SOURCE page as it stands.
 *  - `to` indexes the DESTINATION page AFTER the removal from the source, so `to === length` is
 *    legal and is the only way to express "drop below the last question". Reusing
 *    `isValidReorder` would make appending to a section impossible.
 *  - `from === to` carries no meaning at all across two lists, so it is not a refusal.
 *
 * The PAGES being different is the caller's business — it branched on
 * `event.previousContainer === event.container` to get here — and asserting it again from index
 * arithmetic that cannot see a page id would be a guard that only looks like one.
 */
export function isValidCrossPageMove(
  from: number,
  sourceLength: number,
  to: number,
  destinationLength: number,
): boolean {
  return (
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 0 &&
    from < sourceLength &&
    to >= 0 &&
    to <= destinationLength
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/Angular && npx vitest run src/lib/builder/reorder.spec.ts`
Expected: PASS — every `isValidCrossPageMove` case green, every pre-existing case in the file still green.

- [ ] **Step 5: Prepare the commit (do not run `git commit` without approval)**

```bash
git add packages/Angular/src/lib/builder/reorder.ts packages/Angular/src/lib/builder/reorder.spec.ts
# message:
# feat(builder): a cross-page move's two indices address two lists, so isValidReorder cannot judge it
```

---

### Task 2: `ReorderNotice.fromPageId` and a cross-page-aware `undoReorderMove`

**Files:**
- Modify: `packages/Angular/src/lib/builder/reorder.ts` (`ReorderNotice` at `:111-136`, `undoReorderMove` at `:176-186`, `destination` at `:206-222`)
- Test: `packages/Angular/src/lib/builder/reorder.spec.ts` (`describe('undoReorderMove', ...)` at `:150-213`)

**Interfaces:**
- Consumes: `ReorderNotice` from Task 0 (existing).
- Produces:
  - `ReorderNotice` gains `readonly fromPageId: string;`
  - `export interface UndoMove { readonly from: number; readonly to: number; readonly toPageId: string; }`
  - `export function undoReorderMove(notice: Pick<ReorderNotice, 'questionId' | 'wasBefore' | 'pageId' | 'fromPageId'>, currentQuestionIds: readonly string[], homeQuestionIds: readonly string[]): UndoMove | null`

  The signature gains a third argument and the return type gains `toPageId`. **Every existing call site and spec must pass the third argument.** For an in-page notice (`pageId === fromPageId`) the same array is passed twice — that is not a smell, it is the truth: "where it is now" and "where it goes home" are the same list.

- [ ] **Step 1: Write the failing test**

In `packages/Angular/src/lib/builder/reorder.spec.ts`, replace the whole `describe('undoReorderMove', ...)` block (currently `:150-213`) with the version below. It keeps every existing case — with `fromPageId` added to each fixture, the current list passed twice, and `toPageId` added to each expectation — and adds the cross-page cases. Add `type UndoMove` to the file's `import { ... } from './reorder';` if you reference it.

```ts
describe('undoReorderMove', () => {
  /** An in-page notice: the question is on the page it started on. */
  const inPage = (questionId: string, wasBefore: string | null) => ({
    pageId: 'pA',
    fromPageId: 'pA',
    questionId,
    wasBefore,
  });

  /** A cross-page notice: the question is on pB now and belongs back on pA. */
  const crossed = (questionId: string, wasBefore: string | null) => ({
    pageId: 'pB',
    fromPageId: 'pA',
    questionId,
    wasBefore,
  });

  describe('happy', () => {
    it('moves the question back in front of the one it used to precede', () => {
      const n = inPage('qa1', 'qa2');
      const ids = ['qa2', 'qa3', 'qa1'];
      expect(undoReorderMove(n, ids, ids)).toEqual({ from: 2, to: 0, toPageId: 'pA' });
    });

    it('survives an unrelated move made while the band stood', () => {
      const n = inPage('qa1', 'qa2');
      const ids = ['qa3', 'qa2', 'qa1'];
      expect(undoReorderMove(n, ids, ids)).toEqual({ from: 2, to: 1, toPageId: 'pA' });
    });

    it('finds both the question and its anchor by id, not by index', () => {
      const n = inPage('qa1', 'qa3');
      const ids = ['qa2', 'qa3', 'qa1'];
      expect(undoReorderMove(n, ids, ids)).toEqual({ from: 2, to: 1, toPageId: 'pA' });
    });

    it('puts a question that was LAST back at the end', () => {
      const n = inPage('qa1', null);
      const ids = ['qa1', 'qa2', 'qa3'];
      expect(undoReorderMove(n, ids, ids)).toEqual({ from: 0, to: 2, toPageId: 'pA' });
    });
  });

  describe('edge', () => {
    it('sends a crossed question back to the page it came from', () => {
      // It sits on pB now; home is pA, where it used to sit in front of qa2.
      const n = crossed('qa1', 'qa2');
      expect(undoReorderMove(n, ['qb1', 'qa1'], ['qa2', 'qa3'])).toEqual({
        from: 1,
        to: 0,
        toPageId: 'pA',
      });
    });

    it('does NOT apply the splice-out correction across pages', () => {
      // D4. In-page, removing the question shifts an anchor that sat AFTER it down by one, so
      // the insert index is `anchor - 1`. Across pages the removal happens in the OTHER array,
      // so the home page's indices do not move and the anchor's index is the answer as-is.
      // `qa3` is at home index 2; the undo must land at 2, not 1.
      const n = crossed('qa1', 'qa3');
      expect(undoReorderMove(n, ['qa1'], ['qa2', 'qb9', 'qa3'])).toEqual({
        from: 0,
        to: 2,
        toPageId: 'pA',
      });
    });

    it('sends a crossed question that was LAST to index === length, not length - 1', () => {
      // The home array does not shrink on this removal, so "after everything" is `length`.
      const n = crossed('qa1', null);
      expect(undoReorderMove(n, ['qa1'], ['qa2', 'qa3'])).toEqual({
        from: 0,
        to: 2,
        toPageId: 'pA',
      });
    });

    it('sends a crossed question home to a section that is now empty', () => {
      // The move that emptied the section is exactly the one most worth undoing.
      const n = crossed('qa1', null);
      expect(undoReorderMove(n, ['qb1', 'qa1'], [])).toEqual({
        from: 1,
        to: 0,
        toPageId: 'pA',
      });
    });
  });

  describe('worst', () => {
    it('refuses a question that is no longer there', () => {
      const n = inPage('gone', 'qa2');
      const ids = ['qa1', 'qa2', 'qa3'];
      expect(undoReorderMove(n, ids, ids)).toBeNull();
    });

    it('refuses when the page itself is gone, which arrives as an empty list', () => {
      const n = inPage('qa1', 'qa2');
      expect(undoReorderMove(n, [], [])).toBeNull();
    });

    it('refuses when the HOME page is gone, which also arrives as an empty list', () => {
      // A crossed question whose original section was deleted while the band stood. `wasBefore`
      // names an anchor that is not in the empty home list, so this refuses through the same
      // path as a deleted anchor rather than through a branch of its own.
      const n = crossed('qa1', 'qa2');
      expect(undoReorderMove(n, ['qb1', 'qa1'], [])).toBeNull();
    });

    it('refuses when the anchor was deleted, rather than guessing a position', () => {
      const n = inPage('qa1', 'gone');
      const ids = ['qa2', 'qa3', 'qa1'];
      expect(undoReorderMove(n, ids, ids)).toBeNull();
    });

    it('refuses when the question is already back where it started', () => {
      const n = inPage('qa1', 'qa2');
      const ids = ['qa1', 'qa2', 'qa3'];
      expect(undoReorderMove(n, ids, ids)).toBeNull();
    });

    it('never resolves a CROSSED undo to a no-op, because the pages differ', () => {
      // The in-page `to === from` refusal must not fire here: the indices belong to different
      // lists, and putting the question on another page is never "already there".
      const n = crossed('qa1', 'qa2');
      expect(undoReorderMove(n, ['qa1'], ['qa2'])).toEqual({ from: 0, to: 0, toPageId: 'pA' });
    });

    it('resolves against where the anchor is NOW, which is the limit of what one anchor can do', () => {
      const n = inPage('qa1', 'qa2');
      const ids = ['qa2', 'qa1', 'qa3'];
      expect(undoReorderMove(n, ids, ids)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/Angular && npx vitest run src/lib/builder/reorder.spec.ts`
Expected: FAIL — the existing implementation returns `{from, to}` with no `toPageId`, so every case fails on the shape, and the cross-page cases fail on the arithmetic.

- [ ] **Step 3: Write minimal implementation**

In `packages/Angular/src/lib/builder/reorder.ts`:

**3a.** Add `fromPageId` to `ReorderNotice`, directly above the existing `pageId` field, and re-document `pageId`:

```ts
  /**
   * The page the question is on NOW — the destination, when the move crossed a section.
   *
   * `pageId` and `fromPageId` are equal for every in-page move, which is what {@link
   * undoReorderMove} reads to decide whether the splice-out correction applies. Storing the pair
   * rather than a boolean means the band can also FIND both pages when Undo is clicked, without
   * a second lookup that could disagree.
   */
  readonly pageId: string;
  /**
   * The page the question came FROM, and so the page Undo must put it back on (issue #149).
   *
   * Equal to `pageId` for an in-page move. Without it, Undo resolved `wasBefore` inside the
   * destination section and put the question back at the right index in the WRONG section — the
   * anchor is on the source page, so in practice the undo simply refused and the band lapsed
   * with the move still standing.
   */
  readonly fromPageId: string;
```

**3b.** Add the return type above `undoReorderMove`:

```ts
/** Where an Undo puts the question back. `toPageId` is the page it came from. */
export interface UndoMove {
  /** Its index in the page it is on NOW. */
  readonly from: number;
  /** Its index in `toPageId`'s list, after the removal — so `length` means "at the end". */
  readonly to: number;
  readonly toPageId: string;
}
```

**3c.** Replace `undoReorderMove` and `destination` with:

```ts
export function undoReorderMove(
  notice: Pick<ReorderNotice, 'questionId' | 'wasBefore' | 'pageId' | 'fromPageId'>,
  currentQuestionIds: readonly string[],
  homeQuestionIds: readonly string[],
): UndoMove | null {
  const from = currentQuestionIds.indexOf(notice.questionId);
  if (from < 0) {
    return null;
  }
  const crossed = notice.pageId !== notice.fromPageId;
  const to = destination(notice.wasBefore, from, homeQuestionIds, crossed);
  if (to === null || (!crossed && to === from)) {
    return null;
  }
  return { from, to, toPageId: notice.fromPageId };
}
```

```ts
/**
 * Where the moved question has to land to sit immediately before its anchor again, or `null`
 * when there is no such place.
 *
 * `homeQuestionIds` is the page it is going BACK to — the same list as the one it is on now for
 * an in-page undo, a different one for a cross-section undo.
 *
 * THE SPLICE-OUT CORRECTION IS IN-PAGE ONLY, and that is the whole of the arithmetic here.
 * `moveItemInArray` splices OUT and then IN of one array, so an anchor that sat after the
 * question has already shifted down by one by the time the insert happens. `transferArrayItem`
 * splices out of the OTHER array, so the home page's indices do not move at all: correcting
 * there lands the question one position too early, on every form whose anchor sat after it.
 *
 * The same split governs `wasBefore === null`. In-page, "the end" is `length - 1` because the
 * array shrank on removal; across pages it is `length`, which `transferArrayItem` accepts.
 *
 * A DELETED anchor refuses rather than falling back to an index. Undo is a promise to put one
 * thing back exactly; where "before a question that is gone" is cannot be worked out, and
 * guessing is how a band ends up moving the right question to the wrong place. A HOME PAGE that
 * has been deleted arrives as an empty list and refuses through this same path.
 *
 * KNOWN LIMIT: an anchor that has itself been MOVED is resolved against where it now sits. No
 * neighbour survives that — undoing one move while a second has reordered the same pair has no
 * unique answer — and this is the case where Undo can resolve to "already there" and simply
 * lapse. It is a convenience that declines; the badge goes on reporting the rule, which is the
 * half that has to be right.
 */
function destination(
  wasBefore: string | null,
  from: number,
  homeQuestionIds: readonly string[],
  crossed: boolean,
): number | null {
  if (wasBefore === null) {
    // Nothing followed it. The end of the page is still the end of the page: every write path
    // other than a reorder APPENDS (plan §1.5), so anything added since was added after it, and
    // "last among everything that existed at the time" is where it was.
    return crossed ? homeQuestionIds.length : homeQuestionIds.length - 1;
  }
  const anchor = homeQuestionIds.indexOf(wasBefore);
  if (anchor < 0) {
    return null;
  }
  if (crossed) {
    return anchor;
  }
  return anchor > from ? anchor - 1 : anchor;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/Angular && npx vitest run src/lib/builder/reorder.spec.ts`
Expected: PASS.

Then: `cd packages/Angular && pnpm test`
Expected: **PASS** — and that is the trap, not the reassurance. **No spec in this package imports `form-builder.component.ts`** (verified), and Vitest strips types without checking them, so the component is never compiled by the suite at all. It is currently broken in three places and the suite cannot see any of them.

Run the compiler instead:

```bash
cd packages/Angular && pnpm run typecheck
```
Expected: **FAIL with three errors** — the two `ReorderNotice` literals that now lack `fromPageId` (`noteAnyDamage` at `:629`, `reorderQuestion` at `:1379`) and the two-argument `undoReorderMove` call at `:1438`. Those three errors are the checklist for Task 4. Do not fix them here; Task 4 owns that file.

- [ ] **Step 5: Prepare the commit (do not run `git commit` without approval)**

```bash
git add packages/Angular/src/lib/builder/reorder.ts packages/Angular/src/lib/builder/reorder.spec.ts
# message:
# feat(builder): Undo has to know which section a question came from, not just which index
#
# The splice-out correction is in-page only: transferArrayItem removes from the other
# array, so a corrected index lands the question one position too early on the way home.
```

Note in the message body that `packages/Angular` does not typecheck at this commit — Task 4 closes it. If a clean-at-every-commit history is wanted instead, ask whether to squash Tasks 2–4 before committing.

---

### Task 3: `persistCrossPageMove` — the write order that survives a partial failure

**Files:**
- Modify: `packages/Angular/src/lib/builder/builder-state.service.ts` (add after `persistQuestionOrder`, `:605-616`)
- Create: `packages/Angular/src/lib/builder/builder-state.cross-page-move.spec.ts`

**Interfaces:**
- Consumes: `PageNode`, `QuestionNode` from `./builder-models`; the private `saveChecked` and public `persistQuestionOrder` already on the service.
- Produces: `public async persistCrossPageMove(node: QuestionNode, source: PageNode, destination: PageNode): Promise<boolean>` on `BuilderStateService`.
  **Precondition:** the caller has already moved `node` from `source.questions` into `destination.questions` in memory. Violations throw.

- [ ] **Step 1: Write the failing test**

Create `packages/Angular/src/lib/builder/builder-state.cross-page-move.spec.ts`:

```ts
/**
 * The write ORDER of a cross-section move, which is the whole of its integrity story.
 *
 * There is no transaction here: this is one `PageID` write plus up to N+M `DisplayOrder` writes,
 * one row at a time, any of which the database can refuse. Rolling back is not the answer — the
 * rollback needs writes of its own, which can also fail — so the order is chosen instead, such
 * that every prefix of it leaves a tree that reloads consistently.
 *
 * MEMBERSHIP GOES FIRST AND ALONE. `PageID` is the only write that cannot be re-derived from
 * what is on screen; `DisplayOrder` is re-asserted by the next reorder or by a reload. And
 * because `PageID` is one column on one row written by one `Save()`, a question belongs to
 * exactly one page at every instant — "orphaned between sections" is unrepresentable, and the
 * worst a partial failure can do is leave an order within one page wrong.
 */
import { describe, it, expect } from 'vitest';
import { BuilderStateService } from './builder-state.service';
import type { mjBizAppsFormsFormQuestionEntity } from '@mj-biz-apps/forms-entities';
import type { PageNode, QuestionNode } from './builder-models';

/** What a row's `Save()` actually persisted, in call order across the whole fixture. */
interface WriteLog {
  entries: Array<{ id: string; pageId: string | null; displayOrder: number }>;
}

class FakeQuestionEntity {
  public PageID: string | null = null;
  public DisplayOrder = 0;
  public LatestResult = { CompleteMessage: 'refused by the fake' };

  public constructor(
    public readonly ID: string,
    private readonly log: WriteLog,
    /** Return false to model a refusal on this row. */
    private readonly accept: () => boolean = () => true,
  ) {}

  public async Save(): Promise<boolean> {
    if (!this.accept()) {
      return false;
    }
    this.log.entries.push({ id: this.ID, pageId: this.PageID, displayOrder: this.DisplayOrder });
    return true;
  }
}

const asEntity = (e: FakeQuestionEntity): mjBizAppsFormsFormQuestionEntity =>
  e as unknown as mjBizAppsFormsFormQuestionEntity;

function node(entity: FakeQuestionEntity): QuestionNode {
  return { entity: asEntity(entity), options: [] };
}

/** A page whose entity only needs an ID for this method. */
function page(id: string, questions: QuestionNode[]): PageNode {
  return { entity: { ID: id } as PageNode['entity'], questions };
}

/**
 * pA holds a1 a2 a3 (DisplayOrder 0 1 2), pB holds b1 b2 (0 1), and `a2` has ALREADY been moved
 * in memory into pB at `index` — which is the precondition the method is documented to require.
 */
function fixture(index: number, accept: () => boolean = () => true) {
  const log: WriteLog = { entries: [] };
  const make = (id: string, pageId: string, order: number): FakeQuestionEntity => {
    const e = new FakeQuestionEntity(id, log, accept);
    e.PageID = pageId;
    e.DisplayOrder = order;
    return e;
  };
  const a1 = node(make('a1', 'pA', 0));
  const a2 = node(make('a2', 'pA', 1));
  const a3 = node(make('a3', 'pA', 2));
  const b1 = node(make('b1', 'pB', 0));
  const b2 = node(make('b2', 'pB', 1));

  const destinationQuestions = [b1, b2];
  destinationQuestions.splice(index, 0, a2);

  return {
    log,
    moved: a2,
    source: page('pA', [a1, a3]),
    destination: page('pB', destinationQuestions),
    service: new BuilderStateService(),
  };
}

describe('persistCrossPageMove', () => {
  describe('happy', () => {
    it('writes membership FIRST, in one row write, before renumbering anything', async () => {
      const { service, moved, source, destination, log } = fixture(1);

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(true);

      expect(log.entries[0]).toEqual({ id: 'a2', pageId: 'pB', displayOrder: 1 });
    });

    it('renumbers the destination and then the source, and never the moved row twice', async () => {
      // `persistQuestionOrder` skips a row whose DisplayOrder already matches its index, and the
      // membership write set the moved row to its final index — so it is skipped here. That
      // reads like an omission unless it is asserted.
      const { service, moved, source, destination, log } = fixture(1);

      await service.persistCrossPageMove(moved, source, destination);

      expect(log.entries.map((e) => e.id)).toEqual(['a2', 'b2', 'a3']);
      expect(log.entries.filter((e) => e.id === 'a2')).toHaveLength(1);
    });

    it('leaves both pages numbered 0..n-1 with no collision', async () => {
      const { service, moved, source, destination } = fixture(1);

      await service.persistCrossPageMove(moved, source, destination);

      expect(destination.questions.map((q) => q.entity.DisplayOrder)).toEqual([0, 1, 2]);
      expect(source.questions.map((q) => q.entity.DisplayOrder)).toEqual([0, 1]);
      expect(destination.questions.map((q) => q.entity.PageID)).toEqual(['pB', 'pB', 'pB']);
    });
  });

  describe('edge', () => {
    it('appends to the end of the destination', async () => {
      const { service, moved, source, destination, log } = fixture(2);

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(true);

      expect(log.entries[0]).toEqual({ id: 'a2', pageId: 'pB', displayOrder: 2 });
      expect(destination.questions.map((q) => q.entity.ID)).toEqual(['b1', 'b2', 'a2']);
    });

    it('writes PageID even when DisplayOrder happens not to change', async () => {
      // THE TRAP. Moving a question from index 1 of one section to index 1 of another leaves
      // DisplayOrder untouched, so `persistQuestionOrder` would skip it and PageID would never
      // reach the database — the question snaps back to its old section on the next reload.
      const { service, moved, source, destination, log } = fixture(1);
      expect(moved.entity.DisplayOrder).toBe(1);

      await service.persistCrossPageMove(moved, source, destination);

      expect(log.entries.some((e) => e.id === 'a2' && e.pageId === 'pB')).toBe(true);
    });
  });

  describe('worst', () => {
    it('writes nothing else when the membership write is refused', async () => {
      // Fail at (1): disk is exactly the pre-move state, so the move simply did not happen.
      const { service, moved, source, destination, log } = fixture(1, () => false);

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(false);

      expect(log.entries).toEqual([]);
    });

    it('reports a refusal to the author rather than swallowing it', async () => {
      const { service, moved, source, destination } = fixture(1, () => false);

      await service.persistCrossPageMove(moved, source, destination);

      expect(service.lastFailure()).toContain('refused by the fake');
    });

    it('reports false when a renumber fails after membership stuck', async () => {
      // Fail during (2)/(3): membership is on disk, so the question belongs to exactly one page.
      let calls = 0;
      const { service, moved, source, destination } = fixture(1, () => {
        calls += 1;
        return calls === 1;
      });

      expect(await service.persistCrossPageMove(moved, source, destination)).toBe(false);
    });

    it('refuses a question the caller has not moved in memory yet', async () => {
      const { service, moved, source, destination } = fixture(1);
      destination.questions = destination.questions.filter((q) => q !== moved);

      await expect(service.persistCrossPageMove(moved, source, destination)).rejects.toThrow(
        /not in destination page/,
      );
    });

    it('refuses a question still sitting in the source page', async () => {
      const { service, moved, source, destination } = fixture(1);
      source.questions.push(moved);

      await expect(service.persistCrossPageMove(moved, source, destination)).rejects.toThrow(
        /still in source page/,
      );
    });

    it('refuses a same-page "move", which is persistQuestionOrder\'s job', async () => {
      const { service, moved, source, destination } = fixture(1);

      await expect(service.persistCrossPageMove(moved, source, source)).rejects.toThrow(
        /same page/,
      );
      expect(destination.questions).toContain(moved);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/Angular && npx vitest run src/lib/builder/builder-state.cross-page-move.spec.ts`
Expected: FAIL — `service.persistCrossPageMove is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `packages/Angular/src/lib/builder/builder-state.service.ts`, add directly after `persistQuestionOrder`:

```ts
  /**
   * Move a question to another page and renumber BOTH pages (issue #149).
   *
   * The caller has already moved it in the in-memory tree — this persists that, it does not
   * decide it. The preconditions are asserted rather than assumed because getting them wrong is
   * silent: renumbering a page the question is still in writes the collision it exists to avoid.
   *
   * THE ORDER IS THE INTEGRITY STORY. There is no transaction — this is one `PageID` write plus
   * up to N+M `DisplayOrder` writes, one row at a time, and `persistQuestionOrder` already
   * documents that it can fail halfway. So the order is chosen so that every prefix of it leaves
   * a tree that reloads consistently:
   *
   *   1. the moved question's `PageID` AND its final `DisplayOrder`, in ONE `Save()`;
   *   2. the destination's remaining rows;
   *   3. the source's remaining rows.
   *
   * Membership goes first and alone because it is the only write that cannot be re-derived from
   * what is on screen — a wrong `DisplayOrder` is corrected by the next reorder or a reload; a
   * lost `PageID` is not. And because `PageID` is one column on one row written by one `Save()`,
   * the question belongs to exactly one page at every instant: "orphaned between sections" is
   * unrepresentable, and the worst a partial failure can do is leave the order within one page
   * wrong. Failing at (1) leaves the pre-move state untouched; failing inside (2) or (3) leaves
   * duplicate or gapped `DisplayOrder` values, which `loadTree`'s sort tolerates.
   *
   * NOTHING IS ROLLED BACK, matching `reorderQuestion`: the screen goes on showing what the
   * author did, `lastFailure()` says the database refused, and a reload re-asserts the truth. A
   * rollback needs writes of its own, which can fail in turn, and would be a second answer to a
   * question this file already answers one way.
   *
   * The moved row is not written twice: step 1 sets its `DisplayOrder` to its final value, so
   * step 2's `persistQuestionOrder` skips it.
   */
  public async persistCrossPageMove(
    node: QuestionNode,
    source: PageNode,
    destination: PageNode,
  ): Promise<boolean> {
    if (source.entity.ID === destination.entity.ID) {
      throw new Error(
        `persistCrossPageMove: source and destination are the same page (${source.entity.ID}); ` +
          'an in-page reorder is persistQuestionOrder.',
      );
    }
    const index = destination.questions.indexOf(node);
    if (index < 0) {
      throw new Error(
        `persistCrossPageMove: question ${node.entity.ID} is not in destination page ` +
          `${destination.entity.ID}; the caller moves it in memory first.`,
      );
    }
    if (source.questions.includes(node)) {
      throw new Error(
        `persistCrossPageMove: question ${node.entity.ID} is still in source page ` +
          `${source.entity.ID}; renumbering it there would write the collision this avoids.`,
      );
    }

    node.entity.PageID = destination.entity.ID;
    node.entity.DisplayOrder = index;
    if (!(await this.saveChecked(node.entity, 'move question to another section'))) {
      return false;
    }

    const destinationOk = await this.persistQuestionOrder(destination);
    const sourceOk = await this.persistQuestionOrder(source);
    return destinationOk && sourceOk;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/Angular && npx vitest run src/lib/builder/builder-state.cross-page-move.spec.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Prepare the commit (do not run `git commit` without approval)**

```bash
git add packages/Angular/src/lib/builder/builder-state.service.ts \
        packages/Angular/src/lib/builder/builder-state.cross-page-move.spec.ts
# message:
# feat(builder): a cross-section move has no transaction, so the write ORDER is what saves it
#
# Membership first and alone: PageID is the only write that cannot be re-derived from
# what is on screen, and one column on one row cannot leave a question in two sections.
```

---

### Task 4: Connect the lists and wire the drop

**Files:**
- Modify: `packages/Angular/src/lib/builder/form-builder.component.html` (`:305`, `:432-435`)
- Modify: `packages/Angular/src/lib/builder/form-builder.component.ts` (imports `:4-11`, `imports:` array `:154-172`, `noteAnyDamage` `:629`, `canMoveQuestion` doc `:1307-1322`, `dropQuestion` `:1329-1332`, `reorderQuestion` `:1345-1379`, `undoReorder` `:1431-1447`)
- Modify: `packages/Angular/src/lib/builder/form-builder.styles.ts` (`.fb-q-list`, `:527`)

**Interfaces:**
- Consumes: `isValidCrossPageMove`, `undoReorderMove`, `UndoMove`, `ReorderNotice` (Tasks 1–2); `state.persistCrossPageMove` (Task 3).
- Produces: `private async moveQuestionAcrossPages(source: PageNode, destination: PageNode, from: number, to: number): Promise<void>` — the single cross-page write path, and the only place `transferArrayItem` is called. `dropQuestion`'s signature changes to `(page: PageNode, event: CdkDragDrop<PageNode>)`.

- [ ] **Step 1: Connect the drop lists in the template**

`packages/Angular/src/lib/builder/form-builder.component.html`, line 305 — add `cdkDropListGroup` to the canvas wrapper. It is the tightest element that encloses the `@for (page of pages)` loop, and it contains no other `cdkDropList` (the only one in this file is the question list at `:433`), so the group is exactly the set of section lists:

```html
        <!-- Every section's question list is one connected group, which is what lets a question
             be dragged from one section into another (#149). Without it CDK has no candidate
             target outside the list the drag started in and the drop is silently refused. -->
        <div class="fb-canvas" cdkDropListGroup>
```

Then at `:432-435`, hand the list the whole `PageNode` rather than its questions, so the drop event carries the SOURCE page:

```html
            <div
              class="fb-q-list"
              cdkDropList
              [cdkDropListData]="page"
              (cdkDropListDropped)="dropQuestion(page, $event)"
            >
```

`cdkDropListData` is read only by `dropQuestion`, so nothing else has to change. Binding `page.questions` would give the handler the source *array* and no way to reach the source page's id, which is the one thing the write needs.

- [ ] **Step 2: Make an empty section droppable**

`packages/Angular/src/lib/builder/form-builder.styles.ts`, replace the `.fb-q-list` rule at `:527`:

```ts
/* `min-height` is not decoration: an empty section's list is ZERO pixels tall, so CDK can never
   register a pointer as being over it and a drop into an empty section is refused even with the
   lists connected (#149). The empty-state prompt renders above the list, not inside it, so it
   does not fill this. One question row's worth is enough to aim at. */
.fb-q-list { display: flex; flex-direction: column; gap: 10px; min-height: 48px; }
```

- [ ] **Step 3: Write the component wiring**

`packages/Angular/src/lib/builder/form-builder.component.ts`:

**3a.** Extend the CDK import block at `:4-11`:

```ts
import {
  CdkDropList,
  CdkDropListGroup,
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  moveItemInArray,
  transferArrayItem,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
```

**3b.** Add `CdkDropListGroup` to the `imports:` array at `:157`, next to `CdkDropList`.

**3c.** Add `isValidCrossPageMove` and `type UndoMove` to the existing `from './reorder'` import block (`:88-95`).

**3d.** `noteAnyDamage` (`:629`) — an insert never crosses a section, so the two ids are the same page:

```ts
    this.reorderNotice = {
      text: reorderNoticeText({ id, label }, broken, (other) => labels.get(other) ?? 'another question'),
      pageId: page.entity.ID,
      // An insert lands on the page the author clicked; it has not come from anywhere else.
      fromPageId: page.entity.ID,
      questionId: id,
      wasBefore: null,
      damage: damageKeys(broken),
    };
```

**3e.** `reorderQuestion` (`:1379`) — same, for the in-page drag:

```ts
      this.reorderNotice = {
        text,
        pageId: page.entity.ID,
        fromPageId: page.entity.ID,
        questionId: moved.entity.ID,
        wasBefore,
        damage: damageKeys(broken),
      };
```

**3f.** Replace `dropQuestion` (`:1329-1332`):

```ts
  /**
   * Pointer/touch drag-drop. Within a section this mirrors {@link moveQuestion}; across two
   * sections it is {@link moveQuestionAcrossPages} (#149).
   *
   * Branching on container IDENTITY rather than on page ids: CDK is the thing that knows which
   * list the drag started in, and `event.previousContainer.data` is that list's own `PageNode`.
   * Re-deriving the source page by searching the tree for the array the drag came out of would
   * be a second answer to a question CDK has already answered.
   */
  protected async dropQuestion(page: PageNode, event: CdkDragDrop<PageNode>): Promise<void> {
    if (event.previousContainer === event.container) {
      await this.reorderQuestion(page, event.previousIndex, event.currentIndex);
      return;
    }
    await this.moveQuestionAcrossPages(
      event.previousContainer.data,
      page,
      event.previousIndex,
      event.currentIndex,
    );
  }
```

**3g.** Add `moveQuestionAcrossPages` directly below `reorderQuestion` (after its closing brace, before the `// -- the reorder notice` banner at `:1420`):

```ts
  /**
   * Move a question into another section, persist both sections, and say what the move cost
   * (issue #149).
   *
   * THE SAME SHAPE AS {@link reorderQuestion} AND THE SAME BAND, deliberately: one gesture keeps
   * one behaviour. The drop is never refused because of rules — every position in every section
   * is a legal target — and if the move breaks one, the author reads it in the band the in-page
   * drag already raises. Publish is what refuses a broken form (`publish.service.ts`), and it
   * still does.
   *
   * It DISCHARGES the obligation `reorderQuestion` records. That method claims to be the only
   * write path that can invert a pair of surviving questions, and says that if a move to another
   * section ever ships, "the diff has to wrap the new write too". This is that write, and this
   * is the diff wrapping it. `newlyBrokenRules` is a set difference over `collectRuleEntries`
   * across the WHOLE tree, so it already reports breakage on the source section, the destination
   * section and every rule downstream of either — nothing here has to know that.
   *
   * `wasBefore` is read out of the SOURCE page before the transfer, and the notice records both
   * page ids, because Undo has to put the question back in its section and not merely at its
   * index. `transferArrayItem` accepts `to === length`, which is how a drop below the last
   * question is expressed.
   */
  private async moveQuestionAcrossPages(
    source: PageNode,
    destination: PageNode,
    from: number,
    to: number,
  ): Promise<void> {
    if (
      this.busy ||
      !isValidCrossPageMove(from, source.questions.length, to, destination.questions.length)
    ) {
      return;
    }
    const moved = source.questions[from];
    // Read BEFORE the transfer, out of the page it is LEAVING — that is the page Undo returns it
    // to, so the anchor has to be one of that page's questions. `null` when it was last there.
    const wasBefore = source.questions[from + 1]?.entity.ID ?? null;
    const before = this.ruleEntries;
    transferArrayItem(source.questions, destination.questions, from, to);

    const labels = this.itemLabels;
    const broken = newlyBrokenRules(before, this.ruleEntries);
    const text = reorderNoticeText(
      { id: moved.entity.ID, label: moved.entity.Prompt },
      broken,
      (id) => labels.get(id) ?? 'another question',
    );
    // A move that breaks nothing leaves a standing band alone — see the note in
    // `reorderQuestion` about the unrelated nudge that used to take away a live Undo.
    if (text.length > 0) {
      this.reorderNotice = {
        text,
        pageId: destination.entity.ID,
        fromPageId: source.entity.ID,
        questionId: moved.entity.ID,
        wasBefore,
        damage: damageKeys(broken),
      };
    }

    this.busy = true;
    try {
      // Checked rather than discarded, exactly as the in-page reorder does. `persistCrossPageMove`
      // orders its writes so no partial failure can put the question in two sections or none, but
      // it CAN leave an order within one page wrong, and the author has to be able to find that
      // out. `state.lastFailure()` says so on screen; this says so in the log for afterwards.
      if (!(await this.state.persistCrossPageMove(moved, source, destination))) {
        LogError(
          `Move of "${moved.entity.Prompt}" from page ${source.entity.ID} to page ` +
            `${destination.entity.ID} was not fully persisted; DisplayOrder on one of the two ` +
            'pages may not match the order on screen.',
        );
      }
    } finally {
      this.busy = false;
    }
    this.markDirty();
  }
```

**3h.** Replace `undoReorder` (`:1431-1447`):

```ts
  /**
   * Put the moved question back where it came from — its SECTION as well as its position.
   *
   * Re-enters whichever write path inverts the move, so the diff runs again, finds nothing newly
   * broken and clears its own notice. No command stack, and no second definition of what "undone"
   * means. `undoReorderMove` decides which of the two it is; this only dispatches.
   */
  protected async undoReorder(): Promise<void> {
    const notice = this.reorderNotice;
    if (!notice) {
      return;
    }
    const current = this.tree?.pages.find((p) => p.entity.ID === notice.pageId);
    const home = this.tree?.pages.find((p) => p.entity.ID === notice.fromPageId);
    const move: UndoMove | null =
      current && home
        ? undoReorderMove(notice, this.questionIds(current), this.questionIds(home))
        : null;
    if (!current || !home || !move) {
      // The question, the section it is on, or the section it came from was deleted while the
      // band stood. A band offering a move that cannot happen is worse than no band.
      this.dismissReorderNotice();
      return;
    }
    if (move.toPageId === current.entity.ID) {
      await this.reorderQuestion(current, move.from, move.to);
      return;
    }
    await this.moveQuestionAcrossPages(current, home, move.from, move.to);
  }

  private questionIds(page: PageNode): string[] {
    return page.questions.map((q) => q.entity.ID);
  }
```

**3i.** Update the stale claim in `canMoveQuestion`'s doc (`:1317-1318`). The arrows keep refusing at the section boundary; that is now a deliberate difference, not the only boundary that exists:

```ts
   * The boundary is the PAGE's — every path through this method indexes `page.questions`, and
   * the arrows deliberately stop there even though the DRAG no longer does (#149). A drag is a
   * gesture with a visible target; an arrow that silently teleported a question into the next
   * section would be a control whose result the author cannot predict before pressing it.
   *
   * KNOWN CONSEQUENCE, and it is a real gap: keyboard and touch users have no way to move a
   * question between sections at all. Tracked as a follow-up rather than solved here, because
   * the answer is a different control (a "move to section" menu), not a wider arrow.
```

- [ ] **Step 4: Verify it compiles and the suite passes**

```bash
cd packages/Angular && pnpm run typecheck
```
Expected: PASS — clean. This is what catches the `ReorderNotice` and `undoReorderMove` call sites Task 2 left open.

```bash
cd packages/Angular && pnpm test
```
Expected: **FAIL in exactly ONE file, on exactly ONE assertion** — `rule-badges.wiring.spec.ts`, at `expect(source).not.toMatch(/transferArrayItem/)`. That is Task 5's job.

Two things about that are worth knowing before you see them, because both look like something has gone wrong and neither has:

- **The other two assertions in that same block still pass.** `cdkDropListConnectedTo` is banned and we used `cdkDropListGroup`, which is a different directive; and nothing here writes `persistPageOrder`. So the tripwire the issue describes as guarding this catches the change through one third of itself.
- **`reorder.spec.ts`'s page-locality canary also still passes**, even though its own comment promises it "fails the day cross-section moves land". It does not: it only ever iterates *within-page* moves, and that property is still true. It could not have noticed this change. That is exactly why Task 5 has to **add** the cross-page property rather than wait for the canary to go red — the canary is the reason to trust a claim that, as written, nothing was checking.

Every other file must still pass. **If anything else fails, stop and diagnose — it is a real regression, not an expected tripwire.**

```bash
cd ../.. && pnpm run build:packages
```
Expected: PASS — this is the only thing that compiles the template, and the only thing that would catch `[cdkDropListData]="page"` disagreeing with `CdkDragDrop<PageNode>` under `strictTemplates`.

- [ ] **Step 5: Prepare the commit (do not run `git commit` without approval)**

```bash
git add packages/Angular/src/lib/builder/form-builder.component.ts \
        packages/Angular/src/lib/builder/form-builder.component.html \
        packages/Angular/src/lib/builder/form-builder.styles.ts
# message:
# feat(builder): a question can be dragged into another section
#
# Each section rendered its own unconnected cdkDropList, so CDK had no candidate target
# outside the list the drag started in and every cross-section drop was silently refused.
# One cdkDropListGroup connects them; the drop branches on container identity.
#
# An empty section's list was zero pixels tall and could never be aimed at, so min-height
# is part of the fix rather than polish.
```

---

### Task 5: Replace the tripwires, and extend the frozen oracle

The issue is explicit: the guard in `rule-badges.wiring.spec.ts` "must be replaced rather than deleted", and the same applies to the page-locality canary in `reorder.spec.ts`, which its own comment calls "the canary: it fails the day cross-section moves land".

**Files:**
- Modify: `packages/Angular/src/lib/builder/rule-badges.wiring.spec.ts` (`:225-238`)
- Modify: `packages/Angular/src/lib/builder/reorder.spec.ts` (`describe('only rules on the moved page can newly break', ...)`, `:268-307`)
- Modify: `packages/Angular/src/lib/builder/read-horizon.equivalence.spec.ts` (append a `describe` before the file's final `});`)

**Interfaces:**
- Consumes: `collectRuleEntries`, `newlyBrokenRules`, `propertyForm`/`PAGE_A`/`PAGE_B`/`moved` (already in `reorder.spec.ts`); `readHorizon`, `TREE`, the `old*`/`new*` oracle helpers (already in `read-horizon.equivalence.spec.ts`).
- Produces: no production code.

- [ ] **Step 1: Replace the tripwire in `rule-badges.wiring.spec.ts`**

Replace the entire `describe('only a reorder can invert a pair, so only a reorder is watched', ...)` block at `:225-238` with:

```ts
describe('every write that can invert a pair is watched', () => {
  /** The cross-page write path, comments stripped — what actually runs. */
  const crossPageMethod = (): string => {
    const source = builder();
    const start = source.indexOf('private async moveQuestionAcrossPages(');
    expect(start, 'no moveQuestionAcrossPages in the builder').toBeGreaterThan(-1);
    const end = source.indexOf('\n  }', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it('runs the damage diff over the cross-section write, not just the in-page one', () => {
    // WHAT THIS REPLACED. This block used to BAN `transferArrayItem` and
    // `cdkDropListConnectedTo` outright, as a tripwire: `reorderQuestion` claimed to be the only
    // path that can invert a pair of surviving questions, and the ban is where that claim said
    // so out loud rather than letting the notice quietly under-report. Issue #149 shipped the
    // move it was watching for, so the obligation is DISCHARGED here instead of deleted — the
    // new write runs the same `newlyBrokenRules` set difference, which is what the ban existed
    // to guarantee. Deleting it would have left the band under-reporting in silence, which is
    // the one outcome the tripwire was written to make impossible.
    const method = crossPageMethod();
    expect(method).toMatch(/newlyBrokenRules\(/);
    expect(method).toMatch(/damageKeys\(/);
    expect(method).toMatch(/reorderNoticeText\(/);
  });

  it('keeps the cross-section move to ONE write path', () => {
    // The diff is hooked per method, so a second place that transfers between lists is a second
    // place to forget it. One call site is what makes the guard above sufficient.
    const occurrences = builder().match(/transferArrayItem\(/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(crossPageMethod()).toMatch(/transferArrayItem\(/);
  });

  it('records BOTH pages on the band, so Undo returns the question to its section', () => {
    expect(crossPageMethod()).toMatch(/fromPageId: source\.entity\.ID/);
    expect(crossPageMethod()).toMatch(/pageId: destination\.entity\.ID/);
  });

  it('renumbers both sections through the one method that orders the writes', () => {
    // Not two `persistQuestionOrder` calls here: the ORDER is the integrity story, and spreading
    // it across the component would put it somewhere no spec can hold it.
    expect(crossPageMethod()).toMatch(/state\.persistCrossPageMove\(/);
    expect(crossPageMethod()).not.toMatch(/persistQuestionOrder\(/);
  });

  it('still refuses a page-order write, because sections cannot be reordered', () => {
    // Unchanged and still in scope: #149 moves a question between sections; it does not move a
    // section. No page's questions can change position relative to another page's.
    expect(builder()).not.toMatch(/persistPageOrder/);
  });
});
```

- [ ] **Step 2: Reframe the page-locality canary in `reorder.spec.ts`**

The within-page claim is **still true** — a move inside section A cannot invert any pair involving a section B question — so the brute force stays. What has to change is its comment (it says it will fail when cross-section moves land, and it will not) and the addition of its cross-page counterpart, which is where the property genuinely no longer holds.

Replace the comment inside `it('holds for every legal within-page move, on both sections', ...)` (`:270-272`) with:

```ts
    // Brute force rather than argued (§1.6). Still true after #149: a move INSIDE one section
    // cannot invert any pair involving a question in another, so the in-page drag's damage is
    // page-local. What #149 changed is that this is no longer the only kind of move — see the
    // cross-section block below, which is where the property stops holding and why the diff is
    // a set difference over the whole tree rather than over one page.
```

Then append, immediately after that `describe` block closes:

```ts
/**
 * The property the within-page block cannot state, and the reason the damage diff was never
 * scoped to one page (issue #149).
 *
 * A cross-section move changes the position of the moved question relative to EVERY question on
 * both pages at once, so it can break a rule on the source section, on the destination section,
 * or on any page downstream of either. `newlyBrokenRules` is a set difference over
 * `collectRuleEntries` for the whole tree, so it reports all of them without knowing that it is
 * doing anything new — which is exactly why the write path only had to be hooked, not taught.
 */
describe('a cross-section move can break a rule on either section', () => {
  /** `from` of page A moved into page B at `to`, as two new orders. */
  const across = (
    a: readonly string[],
    b: readonly string[],
    from: number,
    to: number,
  ): { a: string[]; b: string[] } => {
    const nextA = [...a];
    const [lifted] = nextA.splice(from, 1);
    const nextB = [...b];
    nextB.splice(to, 0, lifted);
    return { a: nextA, b: nextB };
  };

  it('reports damage for every legal move out of A into B without throwing', () => {
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    for (let from = 0; from < PAGE_A.length; from += 1) {
      for (let to = 0; to <= PAGE_B.length; to += 1) {
        const { a, b } = across(PAGE_A, PAGE_B, from, to);
        const after = collectRuleEntries(propertyForm(a, b));
        // Every reported id is a real rule on the form — the diff never invents one.
        const ids = new Set(after.map((e) => e.id));
        for (const broken of newlyBrokenRules(before, after)) {
          expect(ids.has(broken.id)).toBe(true);
          expect(broken.broken.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is not vacuously true: moving A1 into B breaks the rules on A that read it', () => {
    // "A3 shows when A1 is answered" and A2's jump reads A1. Dragging A1 out of section A and
    // into section B puts it after both of them, so both become unreadable.
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    const { a, b } = across(PAGE_A, PAGE_B, 0, PAGE_B.length);
    const after = collectRuleEntries(propertyForm(a, b));
    expect(newlyBrokenRules(before, after).map((e) => e.itemId).sort()).toEqual(['qa2', 'qa3']);
  });

  it('reports damage on the SOURCE section, which a page-scoped diff would have missed', () => {
    // The case that makes "diff the whole tree" load-bearing rather than incidental: the band is
    // raised on a drop into section B, and the rules it names sit on section A.
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    const { a, b } = across(PAGE_A, PAGE_B, 0, 0);
    const after = collectRuleEntries(propertyForm(a, b));
    const broken = newlyBrokenRules(before, after);
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.every((e) => e.pageId === 'pA')).toBe(true);
  });
});
```

- [ ] **Step 3: Extend the frozen read-horizon oracle**

Append to `packages/Angular/src/lib/builder/read-horizon.equivalence.spec.ts`, immediately before the file's final `});`, a block that applies a cross-page move to the fixture and re-runs the **complete** old-vs-new equivalence over the moved tree:

```ts
  /**
   * The horizons after a question changes SECTION (issue #149).
   *
   * `readHorizon` runs over the whole form's question sequence, not one page, so a cross-section
   * move shifts the horizon of every rule downstream of BOTH ends of it. Nothing in the function
   * had to change for that — which is the claim worth freezing, because "nothing had to change"
   * is indistinguishable from "nobody checked" a year from now.
   *
   * Both directions of the awkward case are covered: a move that EMPTIES a section (the `+ 1` in
   * the page arm of the show horizon is invisible unless a section can be empty) and a move INTO
   * the one that already is.
   */
  describe('after a question is moved to another section', () => {
    /** `TREE` with one question lifted out of `fromPage` and dropped into `toPage` at `at`. */
    const afterMove = (fromPage: string, index: number, toPage: string, at: number): OraclePage[] => {
      const lifted = TREE.find((p) => p.id === fromPage)!.questions[index];
      return TREE.map((page) => {
        if (page.id === fromPage) {
          return { ...page, questions: page.questions.filter((q) => q !== lifted) };
        }
        if (page.id === toPage) {
          const questions = [...page.questions];
          questions.splice(at, 0, lifted);
          return { ...page, questions };
        }
        return { ...page, questions: [...page.questions] };
      });
    };

    /** The whole equivalence, re-run over an arbitrary tree. */
    const agreesEverywhere = (tree: OraclePage[]): void => {
      tree.forEach((page, index) => {
        expect(newPageShow(tree, page.id)).toEqual(oldPageConditionalSources(tree, index));
        expect(newPageJump(tree, page.id)).toEqual(oldPageJumpConditionSources(tree, index));
      });
      for (const id of tree.flatMap((page) => page.questions.map((q) => q.id))) {
        expect(newQuestionShow(tree, id)).toEqual(oldConditionalSources(tree, id));
        expect(newQuestionJump(tree, id)).toEqual(oldQuestionJumpSources(tree, id));
      }
    };

    it('agrees with the oracle when a question moves forward into a later section', () => {
      agreesEverywhere(afterMove('p1', 0, 'p3', 1));
    });

    it('agrees with the oracle when a question moves backward into an earlier section', () => {
      agreesEverywhere(afterMove('p4', 0, 'p1', 0));
    });

    it('agrees with the oracle when the move fills the EMPTY section', () => {
      agreesEverywhere(afterMove('p3', 0, 'p2', 0));
    });

    it('agrees with the oracle when the move EMPTIES a section', () => {
      // p4 holds exactly one question; moving it out leaves a second empty section, which is the
      // shape the `+ 1` in the page arm of the show horizon exists for.
      const emptied = afterMove('p4', 0, 'p1', 0);
      expect(emptied.find((p) => p.id === 'p4')!.questions).toEqual([]);
      agreesEverywhere(emptied);
    });

    it('actually moves the horizon, so the agreement is not vacuous', () => {
      // Before: q4 (first of p3) can read q1 and q3. Move q1 to the end of p4 and it can read
      // neither q1 (now behind it in the walk) nor anything new.
      expect(newQuestionShow(TREE, 'q4')).toEqual(['q1', 'q3']);
      expect(newQuestionShow(afterMove('p1', 0, 'p4', 1), 'q4')).toEqual(['q3']);
    });
  });
```

- [ ] **Step 4: Run the whole package suite**

```bash
cd packages/Angular && pnpm test
```
Expected: **PASS — 115 test files, 0 failures**, with the test count above the 1645 baseline (one new file plus the added cases).

```bash
cd packages/Angular && pnpm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Prepare the commit (do not run `git commit` without approval)**

```bash
git add packages/Angular/src/lib/builder/rule-badges.wiring.spec.ts \
        packages/Angular/src/lib/builder/reorder.spec.ts \
        packages/Angular/src/lib/builder/read-horizon.equivalence.spec.ts
# message:
# test(builder): discharge the cross-section tripwire instead of deleting it
#
# The ban on transferArrayItem was a promise that the damage diff wraps every write that
# can invert a pair. #149 ships such a write, so the guard now asserts the diff covers it
# — deleting the ban would have left the band under-reporting in silence.
```

---

### Task 6: Verify against a real form, then the changeset and the follow-up

A green `pnpm test` is necessary and not sufficient here: **no test in this package renders the component or runs CDK**, so nothing so far has proved that a drop between two sections actually happens in a browser. This task is where the acceptance criteria are checked against the real builder.

**Files:**
- Create: `.changeset/<two-word-name>.md`

**Interfaces:** none.

- [ ] **Step 1: Build everything the host serves**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-149
pnpm run build:packages
```
Expected: PASS. `ngc` with `strictTemplates` is the only compiler that reads `form-builder.component.html`.

- [ ] **Step 2: Hand the smoke test to Soham**

The builder UI is served by **MJ's host**, not by this repo (`cd ../MJ && pnpm start`, Explorer `:4201`), and the host serves the **main checkout**, not this worktree — so this is not something to run from here without coordination. Write the steps out and ask Soham to run them, reporting what he sees:

> On a form with **two sections** — section 1 `[Long text, Email]`, section 2 `[Number]`:
> 1. Drag *Number* from section 2 up into section 1, between *Long text* and *Email*. It should land there.
> 2. Drag it back down into section 2. It should land there.
> 3. Reload the form. *Number* should still be where you left it, in the right section at the right position.
> 4. Add a third, **empty** section. Drag a question into it — the empty section must accept the drop.
> 5. Drag the last question out of a section so the section is empty. It must not lose the question.
> 6. Make section 1's *Email* show only when *Number* is answered, then drag *Number* into section 2 **below** it. The move must be **allowed**, the warning band must appear naming 1 broken rule, and *Email*'s badge must turn broken.
> 7. Click **Undo** on that band. *Number* must return to **section 1, in its original position** — not to the same index of section 2.
> 8. With the rule still broken, press **Publish**. It must be refused.
> 9. Drag *within* one section, as before. Unchanged.

Record what he reports. **Do not claim any acceptance criterion is met on the strength of the unit tests alone** — the criteria about reloading, about the empty section, and about the band and Undo are only settled in the browser.

- [ ] **Step 3: Write the changeset**

`patch`, because this ships no migration and no metadata — see Global Constraints. Check the other changesets already on the branch; if a sibling carries `minor`, downgrading yours changes no released number, so still write `patch`.

```bash
cat > .changeset/cross-section-question-drag.md <<'EOF'
---
'@mj-biz-apps/forms-ng': patch
---

A question can be dragged from any section of the builder into any other section. Each section
rendered its own unconnected `cdkDropList`, so CDK had no candidate target outside the list the
drag started in and every cross-section drop was silently refused — no move, no message. The
lists are now one `cdkDropListGroup`; the drop branches on which list it came from, writes
`PageID` and renumbers `DisplayOrder` on both sections, and raises the same warning band an
in-section drag raises when the move breaks a rule. Undo returns the question to its original
section, not merely to its original index.
EOF
```

- [ ] **Step 4: File the keyboard/touch follow-up**

The issue asks for it explicitly ("Worth a follow-up issue rather than blocking this one"). Draft the body and **ask before running `gh issue create`** — filing is outward-facing.

Title: `A question can only be moved between sections by dragging, so keyboard and touch users cannot move one at all`

Body: the arrow buttons keep refusing at the section boundary by decision in #149 (`canMoveQuestion` indexes one page); the drag no longer does. That leaves keyboard and screen-reader users with no route between sections, which the repo's own UX bar (WCAG AA, `CLAUDE.md` → UI / design tokens) does not accept. The answer is a different control — a "Move to section…" item on the question card's menu — not a wider arrow, because an arrow that teleports a question into the next section has a result the author cannot predict before pressing it. Reference #149 and #148.

- [ ] **Step 5: Final verification, then prepare the commit**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-149
git branch -vv                      # confirm the branch does NOT track origin/next
cd packages/Angular && pnpm test && pnpm run typecheck
cd ../.. && pnpm run build:packages
```

Report each command's real output. Then:

```bash
git add .changeset/cross-section-question-drag.md
# message:
# chore(changeset): patch — this ships no migration and no metadata
```

Do not push. Ask before opening a PR; if asked to, use the `open-pr` skill — the base branch is `next`, never `main`.

---

## Acceptance criteria → where each one is discharged

| Criterion (issue #149) | Where |
|---|---|
| Drag from any section to any other, either direction, 2+ sections | Task 4 steps 1+3; verified Task 6 step 2 (1–2) |
| The drop is never refused because of rules | Task 4 step 3g — no rule check on the path; Task 6 step 2 (6) |
| A move that breaks a rule raises the band and badges the rules | Task 4 step 3g; Task 5 step 1; Task 6 step 2 (6) |
| The cross-page write runs the same `newlyBrokenRules` diff | Task 4 step 3g; asserted in Task 5 step 1 |
| `PageID` updated, `DisplayOrder` renumbered on **both** sections | Task 3 (D2, D3) + its spec |
| Reloading shows the question in its new section and position | Task 3 (the `PageID` write); verified Task 6 step 2 (3) |
| Undo returns the question to its original **section and position** | Task 2 (D4) + its cross-page specs; Task 4 step 3h; Task 6 step 2 (7) |
| `readHorizon` and the oracle still agree, including when a section empties | Task 5 step 3 |
| Jump-target options recompute for both sections | `formTargets` / `pageJumpTargets` / `questionJumpTargets` are getters over `readHorizon`, re-read on the `markDirty()` at the end of Task 4 step 3g; the arithmetic is frozen by Task 5 step 3 |
| A partial write failure is surfaced, not silent, and never orphans a question | Task 3 (D2) + the `worst` block of its spec; the `LogError` in Task 4 step 3g |
| The tripwire is **replaced**, not deleted | Task 5 step 1 |
| Publish still refuses while any rule is broken | Untouched (`publish.service.ts:128-134`); verified Task 6 step 2 (8) |
