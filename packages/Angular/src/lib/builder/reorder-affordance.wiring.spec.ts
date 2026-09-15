/**
 * The reorder arrows a question card offers, and whether the card offers the ones that work.
 *
 * THE DEFECT (issue #84). Both arrows were bound `[disabled]="busy"` and nothing else, so *Move
 * up* on the first question of a page and *Move down* on the last were focusable, tabbable and
 * clickable controls that could never do anything. `reorderQuestion` refuses the move — no
 * `DisplayOrder` was ever corrupted — but a refusal with no feedback is not an affordance, it is
 * a dead control, and a keyboard or screen-reader user has no other way to find that out.
 *
 * Every other reorder pair in this package already disables at its bounds — the logic editor's
 * jump rules, the automation tab's steps, the widget's Ranking question. The builder's question
 * card was the one that did not.
 *
 * WHY THIS SPEC EVALUATES THE BINDING RATHER THAN GREPPING FOR IT. The component uses `inject()`
 * and `templateUrl` and cannot be instantiated in this suite's node environment, so the template
 * is what there is to check. A string match would assert a spelling; the acceptance criterion is
 * a behaviour — "*Move up* is disabled on the first question". So the real `[disabled]`
 * expression is lifted out of the real template and RUN, against a real three-question page, in a
 * scope holding everything the surrounding `@for` puts in scope. Any correct expression passes
 * and any incorrect one fails, which is the property a guard about an affordance needs.
 *
 * The compiled text is this repo's own checked-in template, read off disk in a test process —
 * never anything a user or a request supplies — and it runs nowhere but here. Angular compiles
 * the same string into the same expression at build time; this spec just gets there first.
 *
 * Comments are stripped first: the template explains this decision in prose beside the buttons,
 * and a guard that matches its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidReorder } from './reorder';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const builder = (): string => stripped('form-builder.component.ts');
const builderHtml = (): string => stripped('form-builder.component.html');

// ---------------------------------------------------------------------------
// Lifting the binding out of the template
// ---------------------------------------------------------------------------

/**
 * The `[disabled]` expression on the arrow carrying `label`, as written in the template.
 *
 * Splitting on `<button` bounds each element to its own chunk, so the expression cannot be read
 * off a neighbouring button — the Delete button sits in the same `<div>` and carries a
 * `[disabled]` of its own.
 */
function disabledExpression(label: string): string {
  const chunk = builderHtml()
    .split('<button')
    .find((part) => part.includes(`aria-label="${label}"`));
  expect(chunk, `no <button aria-label="${label}"> in the builder template`).toBeDefined();
  const match = /\[disabled\]="([^"]*)"/.exec(chunk ?? '');
  expect(match, `the "${label}" button has no [disabled] binding`).not.toBeNull();
  return match![1];
}

interface FakeQuestion {
  readonly id: string;
}
interface FakePage {
  readonly questions: readonly FakeQuestion[];
}

/**
 * What the `@for` over `page.questions` has in scope at `index`, plus the component members the
 * expression may reach for.
 *
 * `$first` / `$last` / `$index` / `$count` are here so the spec constrains the OUTCOME and not
 * the spelling: the loop's own implicit variables are a legitimate way to write this, and so is
 * a predicate on the component. What is not legitimate is an expression that leaves a dead
 * control on screen, and no member of this scope can make one of those pass.
 *
 * `canMoveQuestion` is supplied as the CONTRACT the component method has to meet — the same
 * `isValidReorder` that `reorderQuestion` guards the move with. The separate guard below pins the
 * component's own method to it, so the two halves cannot drift into agreeing here and disagreeing
 * on screen.
 */
function evaluateDisabled(
  expression: string,
  page: FakePage,
  index: number,
  busy: boolean,
): boolean {
  const canMoveQuestion = (p: FakePage, n: FakeQuestion, delta: number): boolean => {
    const from = p.questions.indexOf(n);
    return isValidReorder(from, from + delta, p.questions.length);
  };
  const run = new Function(
    'busy',
    'canMoveQuestion',
    'page',
    'node',
    '$index',
    '$count',
    '$first',
    '$last',
    `return (${expression});`,
  ) as (
    busy: boolean,
    canMoveQuestion: (p: FakePage, n: FakeQuestion, delta: number) => boolean,
    page: FakePage,
    node: FakeQuestion,
    index: number,
    count: number,
    first: boolean,
    last: boolean,
  ) => unknown;
  return Boolean(
    run(
      busy,
      canMoveQuestion,
      page,
      page.questions[index],
      index,
      page.questions.length,
      index === 0,
      index === page.questions.length - 1,
    ),
  );
}

const pageOf = (count: number): FakePage => ({
  questions: Array.from({ length: count }, (_, i) => ({ id: `q${i}` })),
});

const moveUpDisabled = (page: FakePage, index: number, busy = false): boolean =>
  evaluateDisabled(disabledExpression('Move up'), page, index, busy);

const moveDownDisabled = (page: FakePage, index: number, busy = false): boolean =>
  evaluateDisabled(disabledExpression('Move down'), page, index, busy);

// ---------------------------------------------------------------------------
// The affordance
// ---------------------------------------------------------------------------

describe('a question card offers only the moves that would move something', () => {
  it('disables Move up on the first question of a page', () => {
    // The reported defect. A native `disabled` on a `<button>` takes it out of the tab order and
    // announces it as unavailable; nothing else on this card does both.
    expect(moveUpDisabled(pageOf(3), 0)).toBe(true);
  });

  it('disables Move down on the last question of a page', () => {
    expect(moveDownDisabled(pageOf(3), 2)).toBe(true);
  });

  it('disables both on a page holding a single question', () => {
    // First and last at once — the case an `$index === 0` / `$index === length - 1` pair and a
    // predicate agree on, and a "disable the ends of the FORM" reading would get wrong.
    expect(moveUpDisabled(pageOf(1), 0)).toBe(true);
    expect(moveDownDisabled(pageOf(1), 0)).toBe(true);
  });

  it('leaves both live in the middle of a page', () => {
    // The other half of the invariant. Disabling too much is the same class of defect as
    // disabling too little, and it is the one a `busy`-only expression cannot commit.
    expect(moveUpDisabled(pageOf(3), 1)).toBe(false);
    expect(moveDownDisabled(pageOf(3), 1)).toBe(false);
  });

  it('keeps every arrow on the page disabled while a write is in flight', () => {
    // `busy` was the ONLY thing these bindings read, and it is still load-bearing: two reorders
    // interleaving write the same `DisplayOrder` column twice. The new bound must not replace it.
    const page = pageOf(3);
    for (let i = 0; i < 3; i++) {
      expect(moveUpDisabled(page, i, true)).toBe(true);
      expect(moveDownDisabled(page, i, true)).toBe(true);
    }
  });

  it('reads the ends of the PAGE, not of the form', () => {
    // Reordering never crosses a page boundary — `reorderQuestion` takes a page and indexes
    // `page.questions` — so the boundary the arrows draw has to be the page's. A second page's
    // first question is disabled upward exactly like the first page's.
    expect(moveUpDisabled(pageOf(4), 0)).toBe(true);
    expect(moveDownDisabled(pageOf(4), 3)).toBe(true);
    expect(moveUpDisabled(pageOf(4), 3)).toBe(false);
    expect(moveDownDisabled(pageOf(4), 0)).toBe(false);
  });
});

/**
 * The half that names members, and why it has to.
 *
 * The block above hands the expression its OWN `canMoveQuestion` — the contract — so nothing in
 * it would notice the component's method quietly disagreeing with that contract. These two
 * assertions are what bind the real method to it. `testing.md` is right that a guard which breaks
 * on a rename is usually testing the wrong thing; it buys behaviour coverage wherever behaviour
 * is reachable, and here it is not — the class cannot be constructed in a node environment. The
 * established shape in this package is to read the source and say so, which is what this does.
 */
describe('the arrow and the guard behind it are one decision', () => {
  it('decides the affordance with the predicate that decides the move', () => {
    // Two copies of "where the ends of the list are" is how an arrow ends up disabled on a
    // question that can move, or live on one that cannot. `isValidReorder` is already the one
    // that refuses the move; the card asks the same question rather than re-deriving the answer.
    expect(builder()).toMatch(
      /canMoveQuestion\([\s\S]{0,400}isValidReorder\(/,
    );
  });

  it('keeps the no-op guard as the safety net rather than trusting the attribute', () => {
    // A `disabled` attribute is an affordance, not an authorisation: drag-drop enters the same
    // path, and `dropQuestion` has no attribute to be disabled by.
    const source = builder();
    const start = source.indexOf('private async reorderQuestion(');
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, start + 400)).toMatch(/!isValidReorder\(from, to, page\.questions\.length\)/);
  });
});
