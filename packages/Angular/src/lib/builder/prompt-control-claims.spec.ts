/**
 * The chat prompt makes factual claims about the builder's controls. This checks them.
 *
 * WHY THIS EXISTS. The shipped prompt tells the model where to send an author when it declines
 * something — "name the control", in its own words. Those sentences are assertions about Angular
 * components, and nothing verified them, so two of them were simply false: it named a "+ button"
 * for adding a question (there is none; the two + buttons on the canvas add a section and an
 * ending) and it said the question's own panel edits its TYPE (the panel shows type as a read-only
 * pill). The model repeated both faithfully, an author following either went hunting, and the same
 * wrong wording was copied into two of the code's refusal messages before anyone opened the
 * templates.
 *
 * The failure was not the sentences. It was that prose asserting facts about components had no
 * check, in a repo that gates hardcoded colours and migration filenames. These are the assertions
 * that were wrong, tied to the components that decide them — so the next person to ADD a type
 * selector, or a real + button, is told which prompt sentence has just become a lie.
 *
 * WHAT THIS CANNOT DO. It reads `metadata/`, which is the dev-time copy. The prompt that actually
 * runs is seeded from a migration, and nothing in TypeScript can reach that — `lint:distribution`
 * is what catches the two drifting apart. So a green run here means the prompt SOURCE agrees with
 * the components, not that the database does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Repo root, from this file: packages/Angular/src/lib/builder → five levels up. */
const REPO = join(__dirname, '..', '..', '..', '..', '..');

const read = (...parts: string[]): string => readFileSync(join(REPO, ...parts), 'utf8');

const prompt = (): string =>
  read('metadata', 'templates', 'templates', 'forms-chat-assistant.template.md');

const builderTemplate = (): string =>
  read('packages', 'Angular', 'src', 'lib', 'builder', 'form-builder.component.html');

const questionPanel = (): string =>
  read('packages', 'Angular', 'src', 'lib', 'builder', 'question-editor.component.html');

/**
 * The whole bullet containing `marker`, not just the line it sits on.
 *
 * THE UNIT OF INSPECTION HAS TO MATCH THE UNIT OF MEANING. A claim in this prompt is a BULLET; it
 * wraps across as many lines as it needs. Matching per LINE made these assertions load-bearing on
 * where the line breaks fell, and wrong in both directions: reflowing a correct bullet onto one
 * line failed the test, and wrapping the stale bullet so its offer landed on a continuation line
 * passed it — a false pass on the exact defect the test exists to catch. Both were reproduced
 * before this helper existed.
 *
 * A bullet runs from its own `-` to the next `-` at the same-or-shallower indent, or a blank line.
 */
function bulletContaining(markdown: string, marker: string): string {
  const lines = markdown.split('\n');
  const hits = lines.filter((line) => line.includes(marker)).length;
  // AN AMBIGUOUS MARKER IS THE SAME BUG ONE LEVEL DOWN. `'question palette'` appears twice — in the
  // Matrix guidance and in the control list — and `findIndex` silently took the first, so this
  // inspected the wrong paragraph and a + button planted in the real bullet went unseen. Fixing the
  // unit of inspection is not enough if the unit of SELECTION can point at the wrong thing; a
  // marker that is not unique is a bug in the test, so it fails rather than guessing.
  if (hits !== 1) {
    throw new Error(
      `marker ${JSON.stringify(marker)} matches ${hits} lines; it must match exactly one bullet`,
    );
  }
  const start = lines.findIndex((line) => line.includes(marker));
  const collected = [lines[start]];
  const indent = (lines[start].match(/^\s*/) ?? [''])[0].length;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') {
      break;
    }
    const thisIndent = (line.match(/^\s*/) ?? [''])[0].length;
    if (/^\s*[-*]\s/.test(line) && thisIndent <= indent) {
      break;
    }
    collected.push(line);
  }
  return collected.join(' ');
}

describe('the chat prompt names controls the builder actually has', () => {
  it('does not promise a "+ button" for adding a question, because the palette uses type tiles', () => {
    // The palette's items are buttons carrying a type each — `fb-palette-item` — not a single add
    // button. If that ever becomes a `+`, this assertion is the thing that says so.
    expect(builderTemplate()).toContain('fb-palette-item');

    // The BULLET that names the palette, whole. The prompt may discuss the phrase — it now warns
    // the model off it explicitly — so what is banned is that bullet OFFERING one.
    const palette = bulletContaining(prompt(), '**question palette**');
    expect(palette, 'the prompt no longer names the question palette').not.toBe('');

    const offersPlusButton =
      /\+ ?button/i.test(palette) && !/there is no ["']?\+|no "\+ ?button"|add a section/i.test(palette);
    expect(offersPlusButton, `the palette bullet offers a + button: ${palette}`).toBe(false);
  });

  it('does not claim the question panel changes a question type, because it cannot', () => {
    const panel = questionPanel();
    // The panel renders the type as a label. A control that CHANGED it would be a select bound to
    // `QuestionType`, or an option list writing it — neither exists, and `[questionType]="…"` is
    // passing the value DOWN to a child, not offering to edit it.
    const hasTypeControl = /<select[^>]*QuestionType|QuestionType"\s*\(change\)|\[\(ngModel\)\][^>]*QuestionType/.test(panel);
    expect(panel).toContain('mjf-type-pill');

    const panelBullet = bulletContaining(prompt(), "question's own panel");
    expect(panelBullet, 'the prompt no longer names the question panel').not.toBe('');

    if (hasTypeControl) {
      // Someone added one. That is a fine thing to add — but the prompt tells authors it is
      // impossible, and that sentence is now wrong.
      expect(
        panelBullet,
        'the question panel can now change a type, so the prompt must stop saying it cannot',
      ).not.toMatch(/cannot change|NOT its type|cannot be changed/i);
      return;
    }

    // No control: the bullet must say so, because "the panel edits its type" is what it used to say.
    expect(
      panelBullet,
      'the panel bullet must say a question type cannot be changed there',
    ).toMatch(/NOT its type|cannot change it|cannot be changed/i);
  });

  it('does not send an author to the Design tab for anything the assistant can do itself', () => {
    // THIS ASSERTION USED TO PIN THE OPPOSITE, and was wrong. It read "sends colour, size and
    // radius to the Design tab, which is where they live" and called that "the one control claim
    // that was right all along" — while the same prompt says a size request IS a `setLayout` and
    // tells the model not to answer one with `unsupported`. Colours and fonts are a `restyle`, the
    // five layout tokens are a `setLayout`, and the Design tab alone owns only the logo and the
    // background image. So the guard was holding the stale half of a contradiction in place, which
    // is worse than not testing it: the next person to notice has to argue with a green test.
    const designTab = bulletContaining(prompt(), '**Design tab**');
    expect(designTab, 'the prompt no longer names the Design tab at all').not.toBe('');

    // The bullet may HAND BACK a capability — saying "its colours are yours" is the correction, not
    // the defect — so what is checked is the part that sends somebody away: everything before the
    // sentence that returns them. Split on the hand-back, and inspect only the offer.
    const offer = designTab.split(/which are the only|are all\s+yours|are yours/i)[0];
    for (const owned of ['colour', 'font', 'size', 'alignment', 'radius']) {
      expect(
        offer.toLowerCase(),
        `the Design tab bullet offers "${owned}", which the assistant can set itself: ${offer}`,
      ).not.toContain(owned);
    }
  });
});
