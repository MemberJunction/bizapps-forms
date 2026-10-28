# UI audit Highs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: native) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the audit's remaining High findings (F07 undo, F08 server-side responses table, F09 URL state) and the two follow-ups (Matrix "required" means every row; button hover never lowers contrast) on `fix/ui-audit-criticals`.

**Architecture:** Each fix is one deep module behind a small interface, at the seam that already owns the behaviour: `PendingDelete` inside `BuilderStateService` (the structural-save queue), a `Search` input on `Forms.ListResponses` plus one client `ResponseQuery` value, per-surface URL codecs over MJ's own `UpdateQueryParams` / `UpdateTabQueryParams`, one shared required rule in `answer-validation.ts`, one CSS token.

**Tech Stack:** Angular 21 (signals, standalone), Vitest (node env, source-text wiring specs), MJ 6.1.6 (`BaseDashboard`, `NavigationService`, `RunViews`), SQL Server.

**Spec:** the approved mockup artifact https://claude.ai/artifact/U1HGujM1VSAgJWLEQLpxzU (before/after + "How it is built" per fix) and the decisions recorded below.

## Decisions (Soham, 2026-10-28)

- Search matches the linked Person's name OR any text answer.
- Builder URL state: the builder finds its own tab and writes through `UpdateTabQueryParams` with a record guard; file an MJ issue for a record-form hook.
- A required Matrix needs every row answered.
- Hover moves the accent away from its text colour (relative oklch), never toward it.
- Undo holds the delete for 10 s instead of delete-then-recreate (ids and logic rules survive).

## Global Constraints

- No `any`, no `.Get()/.Set()`, no hand edits under `generated/` (regenerate with CodeGen, keep only the intended hunk).
- Colours only through `--mj-*` / `--mjf-*` tokens; `pnpm run lint:ui` stays green.
- Every catch logs or returns a failure with context; every timer is cleared on destroy.
- Changeset level: `minor` (the F08 input type is metadata). Forms-ng, forms-entities, forms-core-entities-server.
- `?tab=` is reserved by Explorer's shell; the builder's parameter is `?view=`.

## Review Focus

1. A held delete followed at once by Publish, Preview, a reorder or leaving the builder: the delete must reach the database first, and the published snapshot must not contain the item.
2. A held delete whose commit is refused: the item comes back where it was, and the failure banner says why.
3. Search text with `%`, `_`, `[` or a quote: matched literally, never as SQL.
4. A caller who can read responses but not answers: search matches names only, never answer text.
5. A deep link with a bad or unknown param (`?view=nope`, `?page=-3`, `?response=<deleted id>`): falls back to the default view, no throw, no error banner.

---

### Task 1: Hover keeps its contrast

**Files:** Modify `packages/Angular/src/lib/widget/mj-form.component.css:57-63`; Test `packages/Angular/src/lib/widget/accent-hover.spec.ts` (new).

- [ ] Write the failing spec: reads the CSS, asserts `--mjf-accent-strong` is declared twice (plain fallback `var(--mjf-accent)` first, then `oklch(from var(--mjf-accent) …)`), and that it no longer mixes toward `--mjf-on-accent`. A pure helper `hoverLightness(l)` = `clamp(0, l + (l - 0.62) * 0.25, 1)` mirrors the CSS; for 8 sample accents with their on-accent (white below L 0.62, near-black above) the hover contrast is ≥ the resting contrast.
- [ ] Run, watch it fail; change the token; rewrite the comment above it (why away-from-text).
- [ ] Run green.

### Task 2: A required Matrix needs every row

**Files:** Modify `packages/Entities/src/contracts/answer-validation.ts` (`judgeAnswer`, `requiredMessage`), `packages/Entities/src/contracts/answer-format.ts` (export `missingMatrixRows`); widget `form-question.component.{ts,html,css}` (mark missing rows); Tests: `answer-validation.spec.ts`, `answer-format.spec.ts`, widget wiring spec.

**Interfaces:** Produces `missingMatrixRows(question: AnswerFormatQuestion, value: AnswerValue): string[]` (row VALUES, author order; `[]` when there are no rows or no columns, or the question is not a Matrix).

- [ ] Failing specs: required Matrix, 3 rows, 1 answered → `{ message: '2 rows still need an answer.' }` in `complete` mode; all answered → no problem; `draft` mode → no problem; 1 missing → `'1 row still needs an answer.'`; not required → no problem; no columns → falls back to today's rule. `isAnswerSupplied` on a partial Matrix stays `true` (logic unchanged).
- [ ] Implement: one `requiredProblem(question, value)` replaces the two-step `isRequiredSatisfied`+`requiredMessage` call in `judgeAnswer`.
- [ ] Widget: rows in `missingMatrixRows(...)` get `mjf-matrix__row--missing` and `aria-invalid="true"` on their radios while `errorMessage()` is showing. Wiring spec on the template.
- [ ] Run Entities + Angular suites green.

### Task 3: Doodle Clear can be undone

**Files:** `widget/components/questions/doodle-pad.component.ts` (+ `doodle-strokes.ts` if the history lives there); Test `doodle-strokes.spec.ts` / `doodle-pad` spec.

- [ ] Failing spec: draw 2 strokes, Clear, Undo → both strokes back and the value re-emitted; Clear on an empty pad does nothing; Undo after Clear then Undo again removes the last stroke.
- [ ] Implement: Clear pushes one `clear` entry carrying the cleared strokes (and baked base, if any) onto the undo history; `undo()` of a `clear` restores them.
- [ ] Green.

### Task 4: Builder deletes are held for 10 s with Undo

**Files:** Create `builder/pending-delete.ts`, `builder/pending-delete.spec.ts`, `shared/undo-toast.component.ts`; Modify `builder/builder-state.service.ts` (own the PendingDelete; release in `runStructural` before enqueueing and at the start of `flushPendingSaves`; drop the `includes` early-returns that assume the item is still in the tree), `builder/form-builder.component.{ts,html}` (deleteQuestion / deleteScreen / deletePage / onRemoveOption hold instead of awaiting; no `confirm()`; release before preview and tree reload and in `ngOnDestroy`), `builder/question-editor.component.html` (remove-option label names the option); specs.

**Interfaces:**
```ts
export interface HeldDelete { label: string; restore: () => void; commit: () => Promise<boolean>; }
export interface DeleteTimers { set(fn: () => void, ms: number): number; clear(handle: number): void; }
export const UNDO_WINDOW_MS = 10_000;
export class PendingDelete {
  constructor(timers?: DeleteTimers, windowMs?: number);
  readonly current: Signal<{ label: string } | null>;
  hold(next: HeldDelete): void;        // releases any held delete first
  undo(): boolean;                     // restores; false when nothing is held
  release(): Promise<boolean> | null;  // commits now; on false, restores
}
```
Service: `holdDelete(d: HeldDelete)`, `undoDelete()`, `releaseHeldDelete(): Promise<void>`, `heldDelete` signal.

- [ ] Failing PendingDelete specs (fake timers): hold → current set; 10 s → commit called once, current null; undo before → restore called, commit never; hold B while A held → A committed first; commit false → restore called; release with nothing → null.
- [ ] Failing service specs: `runStructural` after a hold runs the held commit FIRST (order recorded through the fake graph); `flushPendingSaves` awaits it.
- [ ] Failing wiring specs: builder template has no `confirm(`; renders `<mjf-undo-toast>`; delete handlers call `holdDelete`; `ngOnDestroy` and `openPreview` release.
- [ ] Implement; toast = `role="status"` live region, label "Deleted “X”", Undo button ≥ 32 px, countdown bar honours reduced motion, tokens only. After a delete, focus moves to the next row's primary button (or the add affordance).
- [ ] Green; typecheck.

### Task 5: Server search on Forms.ListResponses

**Files:** `metadata/remote-operations/types/forms-list-responses.input.ts` (+ `Search?: string`), `packages/Entities/src/generated/remote_operations.ts` (CodeGen output, only this hunk), `packages/Entities/src/contracts/response-reporting.ts` (`MAX_RESPONSE_SEARCH_LENGTH = 100`), `packages/CoreEntitiesServer/src/operations/ListResponsesServerOperation.ts`, `packages/CoreEntitiesServer/src/engines/FormReportingEngine.ts` (`validateListRequest`, `responseListFilter`, answer-read permission); spec `FormReportingEngine.spec.ts`.

- [ ] Failing engine specs: search trims, empty → no clause; > 100 chars refused with a message; `%`, `_`, `[`, `'` escaped (`LIKE … ESCAPE '\'`); count and page get the same filter; caller without answer read → name-only clause.
- [ ] Implement `searchClause(term, includeAnswers)`; the answer subquery reads the answers entity's base view by metadata (`SchemaName`.`BaseView`), never a hand-written name.
- [ ] Sync-push the type, run CodeGen, keep only the `FormsListResponsesInput` hunk.
- [ ] Green.

### Task 6: The Responses table pages, sorts and searches on the server

**Files:** Create `responses/responses-query.ts` (+ spec); Modify `responses/response-reads.ts` (`readResponsePage(formId, query)`), `responses/response-list.component.ts` (view of one query: search input debounced 300 ms, sortable Submitted with `aria-sort`, sticky thead, pager 25/50/100, no status chips), `responses/responses-tab.component.ts` (owns the query, reloads on change), specs.

**Interfaces:**
```ts
export type ResponseSort = 'newest' | 'oldest';
export interface ResponseQuery { search: string; sort: ResponseSort; page: number; pageSize: 25 | 50 | 100; }
export const DEFAULT_RESPONSE_QUERY: ResponseQuery;
export function toListInput(formId: string, q: ResponseQuery): FormsListResponsesInput;
export function queryFromParams(p: Record<string, string>): ResponseQuery;   // never throws
export function queryToParams(q: ResponseQuery): Record<string, string | null>; // defaults → null
export function pageCount(total: number, pageSize: number): number;
```

- [ ] Failing specs for the module (defaults, bad params, round trip, StartRow math), list template wiring (aria-sort, sticky, pager, no "loaded responses" text), tab reload on query change and stale-response guard (a slower earlier page never overwrites a later one).
- [ ] Implement; delete the in-browser filter and "Load more".
- [ ] Green.

### Task 7: URL state

**Files:** Create `shared/url-params.ts` (tiny helpers: `readEnum`, `readPositiveInt`, `readGuid`), `builder/builder-url.ts` (codec: `view`, `response`, + `ResponseQuery` params), `builder/builder-tab-url.ts` (adapter: find this record's tab, write via `UpdateTabQueryParams` with `{ recordId }` guard, observe via `ObserveTabQueryParams`), `home/home-url.ts`, `dashboard/reporting-url.ts`; Modify the home and reporting dashboards (`OnQueryParamsChanged` + `UpdateQueryParams`), the builder (`setTab`, open/close response, query change), specs.

- [ ] Failing codec specs (every surface: defaults → `{}`/nulls, bad values ignored, round trip) and adapter specs (fake NavigationService/workspace: picks the tab by entity + record id case-insensitively; no tab → no write, logged once; guard passed).
- [ ] Wiring specs: dashboards override `OnQueryParamsChanged`; search writes debounced 400 ms.
- [ ] Implement. Green.

### Task 8: Ship

- [ ] Changeset `minor` (three packages), MJ issue drafted for the record-form URL hook (Soham files or approves), full suite + typecheck + build + `lint:ui`, live smoke on :4201 with console and API log read, before/after artifact update, commits split by task.
