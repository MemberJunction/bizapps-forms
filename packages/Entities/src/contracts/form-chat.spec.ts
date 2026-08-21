import { describe, it, expect } from 'vitest';
import {
  ASSISTANT_CAN,
  ASSISTANT_CANNOT,
  WARM_THREAD_MS,
  attachedImageUrl,
  isThreadWarm,
  parseFormChatResponse,
  withAttachedImage,
  type FormChatTurn,
} from './form-chat';
import { editOperationSchema } from './form-edit';

const NOW = new Date('2026-08-20T12:00:00Z').getTime();
const turn = (msAgo: number): FormChatTurn => ({
  role: 'AI',
  message: 'ok',
  at: new Date(NOW - msAgo),
});

/**
 * Warmth is what decides whether the assistant panel opens itself.
 *
 * It stands in for a fact nothing else records: "the author is still in this conversation". They
 * are, when they have just been carried from the forms list into the form they described; they are
 * not, when they open that form again next week. Getting this wrong in one direction hides a
 * conversation the author is mid-way through, and in the other it springs a panel open over the
 * form every time they visit it.
 */
describe('isThreadWarm', () => {
  it('is warm just after the last turn', () => {
    expect(isThreadWarm([turn(1_000)], NOW)).toBe(true);
  });

  it('has gone cold well past the window', () => {
    expect(isThreadWarm([turn(WARM_THREAD_MS * 10)], NOW)).toBe(false);
  });

  it('cools off exactly at the window', () => {
    expect(isThreadWarm([turn(WARM_THREAD_MS - 1)], NOW)).toBe(true);
    expect(isThreadWarm([turn(WARM_THREAD_MS)], NOW)).toBe(false);
  });

  it('reads the LAST turn, not the first', () => {
    // A thread opened days ago and spoken in a moment ago is warm — which is the ordinary case
    // for any form an author keeps coming back to.
    expect(isThreadWarm([turn(WARM_THREAD_MS * 100), turn(500)], NOW)).toBe(true);
    expect(isThreadWarm([turn(500), turn(WARM_THREAD_MS * 100)], NOW)).toBe(false);
  });

  it('is cold when there is nothing to be warm about', () => {
    expect(isThreadWarm([], NOW)).toBe(false);
  });

  it('is cold when the turn carries no timestamp', () => {
    // Server-built turns have no `at`. Absent must read as cold: a panel that opens because a
    // field was missing is worse than one that stays shut.
    expect(isThreadWarm([{ role: 'AI', message: 'ok' }], NOW)).toBe(false);
  });
});

describe('the image action, as parsed from the model', () => {
  it('carries the picture description and its target through', () => {
    const parsed = parseFormChatResponse(
      JSON.stringify({
        reply: 'Adding a conference hall to the start screen.',
        action: 'image',
        imagePrompt: 'a sunlit conference hall with rows of empty chairs',
        imageTarget: 'welcome',
      }),
    );
    expect(parsed.action).toBe('image');
    expect(parsed.imagePrompt).toContain('conference hall');
    expect(parsed.imageTarget).toBe('welcome');
  });

  it('rejects a target that is not a screen we have', () => {
    // Falls back to a plain reply rather than acting on a target nothing can resolve.
    const parsed = parseFormChatResponse(
      JSON.stringify({ reply: 'ok', action: 'image', imagePrompt: 'x', imageTarget: 'sidebar' }),
    );
    expect(parsed.action).toBe('none');
  });
});

/**
 * The attachment marker, from both ends.
 *
 * It is a contract between two packages that never import each other's code paths — the builder
 * writes it into a message, the chat action reads it back out — so the round trip is the thing
 * worth asserting, along with the values that must NOT survive the trip.
 */
describe('attached images', () => {
  it('round-trips a URL through the message', () => {
    const message = withAttachedImage('put this on the start screen', 'https://api.example.com/forms/asset/abc');

    expect(message).toContain('put this on the start screen');
    expect(attachedImageUrl(message)).toBe('https://api.example.com/forms/asset/abc');
  });

  it('finds nothing in an ordinary message', () => {
    expect(attachedImageUrl('make the buttons rounder')).toBeUndefined();
    expect(attachedImageUrl('')).toBeUndefined();
    expect(attachedImageUrl(null)).toBeUndefined();
  });

  it('refuses a scheme that would not be a picture', () => {
    // This value is written to a screen's MediaURL and rendered into an <img> on a public page.
    // A client that writes its own marker must not be able to put a script there.
    expect(attachedImageUrl('x\n\n[attached image] javascript:alert(1)')).toBeUndefined();
    expect(attachedImageUrl('x\n\n[attached image] data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
    expect(attachedImageUrl('x\n\n[attached image] not-a-url')).toBeUndefined();
  });

  it('takes the last marker, so a quoted earlier one cannot win', () => {
    const message = withAttachedImage(
      'like the one before: [attached image] https://old.example.com/a.png',
      'https://new.example.com/b.png',
    );

    expect(attachedImageUrl(message)).toBe('https://new.example.com/b.png');
  });

  it('stops at the first whitespace, so trailing words are not part of the URL', () => {
    expect(attachedImageUrl('x\n\n[attached image] https://example.com/a.png please')).toBe(
      'https://example.com/a.png',
    );
  });
});

/**
 * The stated boundary, against the operations that actually exist.
 *
 * Not a test of prose — a test that the two claims which have already gone stale once are still
 * the two claims the schema supports. `updateOption` exists, so "reword a choice" must be claimed;
 * no operation adds or removes one, so that must stay refused. If a future operation adds choices,
 * this fails and points at the sentence to change.
 */
describe('the stated capability boundary', () => {
  const ops = editOperationSchema.options.map((o) => o.shape.op.value);

  it('claims rewording a choice, which is an operation that exists', () => {
    expect(ops).toContain('updateOption');
    expect(ASSISTANT_CAN).toContain('reword a choice');
  });

  it('claims sizing and alignment, which setLayout does', () => {
    // It was on the refusal list until the prompt was found contradicting itself: one section
    // said sizes were not the assistant's to set, another forty lines above called "make the
    // questions smaller" a setLayout. The operation was always real; only the sentence was wrong.
    expect(ops).toContain('setLayout');
    expect(ASSISTANT_CAN).toContain('sizes and alignment');
    expect(ASSISTANT_CANNOT).not.toContain('alignment');
  });

  it('refuses adding or removing one, which no operation does', () => {
    // FormResponseAnswer stores the option's id: rewriting the list would strand every answer
    // already naming a choice. If an op ever appears for it, this is the line to revisit.
    expect(ops.some((op) => /addOption|deleteOption|removeOption/.test(op))).toBe(false);
    expect(ASSISTANT_CANNOT).toContain('add and remove choices');
  });
});

/**
 * The roster of edit operations, pinned on purpose.
 *
 * This test fails whenever an operation is ADDED, and that is the point — it is a checkpoint, not
 * a description. Twice in one night a rule that was true of nine operations out of ten was applied
 * to the tenth and was wrong: `setLayout` is the only one that writes a `Form Styles` row, which
 * is why it is the only structural operation the chat panel can offer to undo, and both the
 * session that wrote the undo and the session that wrote the applier missed it independently.
 *
 * WHEN THIS FAILS, answer two questions before updating the list:
 *   1. Does the new operation write `FormStyle.CSSVariables`? If it does, the chat action must
 *      report `StyleID` for it (chat.action.ts, the edit path) or the author gets no way back.
 *   2. Does it change anything ELSE at the same time? If so, the undo chip's wording has to say
 *      what it does not put back — see `noteWhatChanged` in form-chat.component.ts.
 *
 * WHAT IT CANNOT SEE: the prompt template. That ships as metadata inside a migration, so nothing
 * in TypeScript can reach it — this file included. A green build here means the schema and the
 * sentences in `form-chat.ts` agree, and says NOTHING about whether the prompt agrees with either.
 * That gap has gone stale three times in one night and is still open; the only thing standing in
 * it is somebody reading the template.
 */
describe('the edit operation roster', () => {
  it('is exactly these ten, until someone decides otherwise', () => {
    expect(editOperationSchema.options.map((o) => o.shape.op.value).sort()).toEqual(
      [
        'addPage',
        'addQuestion',
        'deletePage',
        'deleteQuestion',
        'moveQuestion',
        'setLayout',
        'updateOption',
        'updatePage',
        'updateQuestion',
        'updateScreen',
      ].sort(),
    );
  });
});
