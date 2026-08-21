import { describe, it, expect } from 'vitest';
import {
  WARM_THREAD_MS,
  isThreadWarm,
  parseFormChatResponse,
  type FormChatTurn,
} from './form-chat';

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
