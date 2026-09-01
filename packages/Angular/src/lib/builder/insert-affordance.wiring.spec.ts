/**
 * Where the insert control lives, and when it is offered.
 *
 * THESE DOCUMENT A CONTRACT; they did not drive the implementation. (`insert-question.spec.ts`
 * and `question-type-picker-model.spec.ts` are the test-first half of this feature.) Saying so
 * because a suite that reads as though every line came from a failing test claims more than it
 * has.
 *
 * WHAT THIS REPLACED. The first version put a + in the canvas gutter, outside the card, revealed
 * on hover of the seam between two questions. The reasoning was that a control acting BETWEEN two
 * questions should not sit inside either — but it bought that at the price of a hover-only
 * affordance, which does not exist on a touch screen, so it needed a media query to force it
 * visible below a breakpoint and was then permanently on for tablet users.
 *
 * Gating on SELECTION instead removes that whole problem rather than working around it: you
 * already select a question to edit it, selection is a tap on any device, and the control appears
 * attached to the thing it acts on. The media query is gone, not replaced.
 *
 * IT IS OUTSIDE THE QUESTION'S OWN SURFACE. Attached inside the card — a divider and a row
 * within the same bordered box — it read as part of the question, like one more of its settings.
 * So the bordered, filled surface is `.fb-q-row`, the question itself, and the add bar is a
 * separate thing sitting under it with air between them. The `<article>` is now a SLOT holding
 * both, which is also why it can stay the drop list's only child.
 *
 * IT ADDS BELOW, and that is the half worth pinning. The gutter + meant "insert at this seam,
 * above this card". A bar attached UNDER a card can only sensibly mean "after this one", and the
 * index it passes has to agree with the position it appears at — an off-by-one here puts the new
 * question on the wrong side of the one you selected, which is exactly the complaint the whole
 * feature exists to fix.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(join(__dirname, file), 'utf8');
const html = (): string => read('form-builder.component.html').replace(/<!--[\s\S]*?-->/g, '');
const css = (): string => read('form-builder.styles.ts').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the add-content bar belongs to the selected question', () => {
  it('is offered only while that question is selected', () => {
    const source = html();
    const bar = source.indexOf('class="fb-q-add"');
    expect(bar).toBeGreaterThan(-1);

    // The nearest @if above it is the selection gate.
    const gate = source.lastIndexOf('@if', bar);
    expect(source.slice(gate, bar)).toMatch(/selectedQuestionId/);
  });

  it('inserts AFTER the question it is attached to', () => {
    // Attached under the card, so it can only mean "after this one" — and $index is the card's
    // own position, so the seam it opens must be the next one.
    const source = html();
    const bar = source.indexOf('class="fb-q-add"');
    const nextTag = source.indexOf('</div>', bar);
    expect(source.slice(bar, nextTag)).toMatch(/openTypePicker\(page,\s*\$index \+ 1\)/);
  });

  it('sits outside the question’s own surface, so it does not read as part of the question', () => {
    // The card is `.fb-q-row`; the article is a transparent slot. If the border and fill were on
    // the article, the add bar would be inside the question's box however it were spaced.
    const sheet = css();
    const row = /\.fb-q-row \{([^}]*)\}/.exec(sheet)?.[1] ?? '';
    expect(row).toMatch(/border:/);
    expect(row).toMatch(/background:/);

    const article = /\n\.fb-q \{([^}]*)\}/.exec(sheet)?.[1] ?? '';
    expect(article).not.toMatch(/border:\s*1px/);
    expect(article).toMatch(/gap:/);
  });

  it('is hidden while a question is being dragged', () => {
    // The placeholder and the preview are clones of the article. Left visible, a dragged card
    // would tow an add bar around with it, and the placeholder would reserve space for one.
    expect(css()).toMatch(/cdk-drop-list-dragging[^{]*\.fb-q-add[^{]*\{[^}]*display:\s*none/);
  });

  it('renders inside the article, so the drop list only ever sees cdkDrag children', () => {
    // fb-q-list is a cdkDropList; an element added BETWEEN the draggable cards competes with the
    // drop placeholder CDK inserts there. The obvious refactor is the one that breaks dragging.
    const source = html();
    const bar = source.indexOf('class="fb-q-add"');
    const openedAt = source.lastIndexOf('<article', bar);
    expect(source.slice(openedAt, source.indexOf('>', openedAt))).toMatch(/cdkDrag/);
    expect(source.indexOf('</article>', bar)).toBeGreaterThan(bar);
  });

  it('does not steal the click that selects the question', () => {
    const source = html();
    const bar = source.indexOf('class="fb-q-add"');
    expect(source.slice(bar, bar + 600)).toMatch(/\(click\)="\$event\.stopPropagation\(\);/);
  });

  it('leaves no trace of the gutter affordance it replaced', () => {
    expect(html()).not.toMatch(/fb-q-insert/);
    expect(css()).not.toMatch(/fb-q-insert/);
  });

  it('is not hover-gated, so it needs no touch escape hatch', () => {
    // The point of moving to selection. A hover-revealed control starts at opacity 0 and needs a
    // media query to force it visible where there is no hover; this one is simply present or
    // absent, so neither exists.
    //
    // Scoped to THIS control on purpose: `.fb-reveal` — the card's action buttons — is
    // hover-revealed and has exactly such a media query. That is pre-existing and not this
    // change's business; an unscoped assertion here would have failed on it and said nothing
    // true about the add bar.
    const rules = css().match(/\.fb-q-add[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.join('\n')).not.toMatch(/opacity:\s*0\s*[;}]/);
  });
});

describe('the insert reuses the existing write paths', () => {
  it('renumbers through the same call the drag path uses, rather than writing DisplayOrder itself', () => {
    const builder = read('form-builder.component.ts');
    const insert = /protected async insertQuestionAt\([\s\S]*?\n  \}/.exec(builder)?.[0] ?? '';
    expect(insert).toMatch(/state\.persistQuestionOrder\(page\)/);
    expect(insert).not.toMatch(/DisplayOrder\s*=/);
  });

  it('runs the same rule-damage diff a costly drag runs', () => {
    // `reorderQuestion` states it is the only path able to invert a pair of surviving questions,
    // and that shipping insert-at-index obliges the new write to run the diff too.
    // `insert-question.spec.ts` proves the diff comes back empty; this proves it is run at all.
    const builder = read('form-builder.component.ts');
    const insert = /protected async insertQuestionAt\([\s\S]*?\n  \}/.exec(builder)?.[0] ?? '';
    expect(insert).toMatch(/const before = this\.ruleEntries/);
    expect(insert).toMatch(/noteAnyDamage\(before/);
  });
});
