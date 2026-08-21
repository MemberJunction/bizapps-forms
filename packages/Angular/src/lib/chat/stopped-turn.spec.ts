/**
 * What the thread looks like after the author presses Stop.
 *
 * The rule under test is the one a real session found: pressing Stop on a turn that was about to
 * answer anyway produced TWO messages about one exchange — "Stopped waiting", then the reply
 * immediately beneath it — which reads as though something went wrong when nothing did. Most turns
 * answer in a second or two, so this is the common case, not the edge one; the fifty-second form
 * build that Stop was written for is the rare one.
 *
 * The placement logic is extracted rather than exercised through `FormChatService`, which needs a
 * live `GraphQLDataProvider` and MJ metadata to send anything at all. What can go wrong here is
 * arithmetic about positions in an array — replacing the wrong turn, or replacing one that a newer
 * message has already moved — so that is what is pinned.
 */
import { describe, expect, it } from 'vitest';
import type { FormChatTurn } from '@mj-biz-apps/forms-entities';

/**
 * Where a reply goes: over the stop notice if one is still waiting for it, otherwise on the end.
 *
 * Mirrors the update inside `FormChatService.send`. Duplicated deliberately and named as such: the
 * alternative was exporting a helper from the service purely to be tested, which makes the service
 * shallower for the benefit of the test rather than the caller.
 */
function place(
  turns: readonly FormChatTurn[],
  reply: FormChatTurn,
  noticeAt: number | null,
): readonly FormChatTurn[] {
  return noticeAt !== null && noticeAt < turns.length
    ? turns.map((existing, i) => (i === noticeAt ? reply : existing))
    : [...turns, reply];
}

const you = (message: string): FormChatTurn => ({ role: 'User', message });
const notice = (): FormChatTurn => ({ role: 'AI', message: 'Stopped waiting. …' });
const reply = (message: string): FormChatTurn => ({ role: 'AI', message });

describe('a reply that arrives after Stop', () => {
  it('takes the place of the notice rather than stacking under it', () => {
    const thread = [you('add a rating question'), notice()];

    const after = place(thread, reply('(finished after you stopped waiting)\n\nDone.'), 1);

    expect(after).toHaveLength(2);
    expect(after[1].message).toContain('Done.');
    // The whole point: no orphaned "Stopped waiting" left above the answer to the same question.
    expect(after.filter((t) => t.message.startsWith('Stopped waiting'))).toEqual([]);
  });

  it('leaves the notice alone when the author has since said something else', () => {
    // The notice is no longer the last word, so replacing it would put a reply above a question it
    // is not the answer to. `stoppedNoticeIndex` is cleared on a new send, which is what null means.
    const thread = [you('first'), notice(), you('second')];

    const after = place(thread, reply('(finished after you stopped waiting)\n\nLate answer.'), null);

    expect(after).toHaveLength(4);
    expect(after[1].message).toContain('Stopped waiting');
    expect(after[3].message).toContain('Late answer.');
  });

  it('appends rather than throwing if the thread got shorter underneath it', () => {
    // A reload between the stop and the reply replaces the array wholesale. The index is cleared on
    // load, but the bounds check is what makes a stale one harmless rather than a crash or — worse —
    // a silently overwritten turn.
    const thread = [you('only turn')];

    const after = place(thread, reply('late'), 5);

    expect(after).toHaveLength(2);
    expect(after[0].message).toBe('only turn');
  });

  it('replaces the notice and nothing else', () => {
    const thread = [you('a'), reply('b'), you('c'), notice()];

    const after = place(thread, reply('answer'), 3);

    expect(after.map((t) => t.message)).toEqual(['a', 'b', 'c', 'answer']);
  });
});
