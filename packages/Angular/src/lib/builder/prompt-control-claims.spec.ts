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

describe('the chat prompt names controls the builder actually has', () => {
  it('does not promise a "+ button" for adding a question, because the palette uses type tiles', () => {
    // The palette's items are buttons carrying a type each — `fb-palette-item` — not a single add
    // button. If that ever becomes a `+`, this assertion is the thing that says so.
    expect(builderTemplate()).toContain('fb-palette-item');

    // The prompt may DISCUSS the phrase — it now warns the model off it explicitly — so what is
    // banned is telling the author to use one. Both orderings, since prose varies.
    const claims = prompt()
      .split('\n')
      .filter((line) => /\+ ?button/i.test(line) && /question/i.test(line))
      .filter((line) => !/there is no|not\b.*\+ ?button|add a section|adds a section/i.test(line));

    expect(claims, 'the prompt tells the author to use a + button to add a question').toEqual([]);
  });

  it('does not claim the question panel changes a question type, because it cannot', () => {
    const panel = questionPanel();
    // The panel renders the type as a label. A control that CHANGED it would be a select bound to
    // `QuestionType`, or an option list writing it — neither exists, and `[questionType]="…"` is
    // passing the value DOWN to a child, not offering to edit it.
    const hasTypeControl = /<select[^>]*QuestionType|QuestionType"\s*\(change\)|\[\(ngModel\)\][^>]*QuestionType/.test(panel);
    expect(panel).toContain('mjf-type-pill');

    if (hasTypeControl) {
      // Someone added one. That is a fine thing to add — but the prompt currently tells authors it
      // is impossible, and that sentence is now wrong.
      expect(
        prompt(),
        'the question panel can now change a type, so the prompt must stop saying it cannot',
      ).not.toMatch(/cannot change|never its type|not its type/i);
      return;
    }

    // No control: the prompt must say so, because "the panel edits its type" is what it used to say.
    expect(
      prompt(),
      'the prompt must tell the model a question type cannot be changed in the builder',
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
    const designTabClaim = prompt()
      .split('\n')
      .filter((line) => /\*\*Design tab\*\*/.test(line))
      .join(' ');
    expect(designTabClaim, 'the prompt no longer names the Design tab at all').not.toBe('');

    // Every capability the chat has must be absent from what that line sends people away for.
    for (const owned of ['colour', 'font', 'size', 'alignment', 'radius']) {
      expect(
        designTabClaim.toLowerCase(),
        `the Design tab line offers "${owned}", which the assistant can set itself`,
      ).not.toContain(owned);
    }
  });
});
