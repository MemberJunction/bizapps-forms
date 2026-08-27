import { describe, it, expect } from 'vitest';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import type { ConditionalSourceQuestion } from './condition-sources';
import { collectRuleEntries, type RuleEntry, type RuleInventoryForm } from './rules-inventory';
import { isValidReorder, newlyBrokenRules, reorderNoticeText, undoReorderMove } from './reorder';

describe('isValidReorder', () => {
  it('accepts an in-bounds move to a different index', () => {
    expect(isValidReorder(0, 2, 3)).toBe(true);
    expect(isValidReorder(2, 0, 3)).toBe(true);
  });

  it('rejects a no-op move (same index)', () => {
    expect(isValidReorder(1, 1, 3)).toBe(false);
  });

  it('rejects out-of-bounds source or target', () => {
    expect(isValidReorder(-1, 1, 3)).toBe(false);
    expect(isValidReorder(0, 3, 3)).toBe(false);
    expect(isValidReorder(3, 0, 3)).toBe(false);
  });

  it('rejects everything in an empty list', () => {
    expect(isValidReorder(0, 0, 0)).toBe(false);
  });

  it('rejects non-integer indices', () => {
    expect(isValidReorder(0.5, 1, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue #73 Phase 2 — what a move COSTS, not just whether it is legal.
// ---------------------------------------------------------------------------

/**
 * Mirrors CDK's `moveItemInArray`, on a copy.
 *
 * The component moves the live array with the real thing; these specs need a before AND an
 * after tree to diff, which a mutating move cannot give. Same splice semantics, deliberately
 * written out rather than imported: pulling `@angular/cdk/drag-drop` into a node-env spec to
 * get four lines of array arithmetic buys nothing.
 */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}

function entry(id: string, broken: string[], itemId = 'qa1'): RuleEntry {
  return {
    id,
    itemKind: 'question',
    itemId,
    pageId: 'pA',
    verb: 'show',
    icon: 'fa-solid fa-eye',
    sentence: `Show "${itemId}" always`,
    broken,
    note: '',
  };
}

const MISSING = 'a question that no longer exists';
const UNREADABLE = 'a question that is answered later than this rule runs, so the rule reads a blank';

describe('newlyBrokenRules', () => {
  it('reports a rule that gained a reason', () => {
    const before = [entry('r1', [])];
    const after = [entry('r1', [UNREADABLE])];
    expect(newlyBrokenRules(before, after).map((e) => e.id)).toEqual(['r1']);
  });

  it('reports nothing when the move broke nothing', () => {
    const rules = [entry('r1', []), entry('r2', [])];
    expect(newlyBrokenRules(rules, rules)).toEqual([]);
  });

  it('does not re-report a rule that was already broken', () => {
    // The author did not just do this, and interrupting them about it teaches them to dismiss
    // the band. The badge has been saying so since the form loaded.
    const before = [entry('r1', [MISSING])];
    const after = [entry('r1', [MISSING])];
    expect(newlyBrokenRules(before, after)).toEqual([]);
  });

  it('reports a rule that gains a SECOND reason', () => {
    // The case keying on entry ids alone silently drops — and the rule with the most to fix.
    const before = [entry('r1', [MISSING])];
    const after = [entry('r1', [MISSING, UNREADABLE])];
    expect(newlyBrokenRules(before, after).map((e) => e.id)).toEqual(['r1']);
  });

  it('reports a broken rule that has no counterpart before the move', () => {
    // Nothing in the reorder path can mint a rule, but the lookup must not throw on the miss.
    expect(newlyBrokenRules([], [entry('r1', [UNREADABLE])]).map((e) => e.id)).toEqual(['r1']);
  });
});

describe('reorderNoticeText', () => {
  const labels: Record<string, string> = { qa1: 'First name', qa3: 'Email', qb1: 'Company' };
  const labelOf = (id: string): string => labels[id] ?? id;
  const email = { id: 'qa3', label: 'Email' };

  it('says nothing when nothing broke', () => {
    expect(reorderNoticeText(email, [], labelOf)).toBe('');
  });

  it('names the one OTHER item every newly-broken rule sits on', () => {
    expect(reorderNoticeText(email, [entry('r1', [UNREADABLE], 'qa1')], labelOf)).toBe(
      'Moved "Email". This broke 1 rule on "First name".',
    );
  });

  it('still names it when one item carries several broken rules', () => {
    const broken = [entry('r1', [UNREADABLE], 'qa1'), entry('r2', [UNREADABLE], 'qa1')];
    expect(reorderNoticeText(email, broken, labelOf)).toBe(
      'Moved "Email". This broke 2 rules on "First name".',
    );
  });

  it('does not name the moved question twice when the broken rule is its own', () => {
    // The common single-question drag, and the one the fixture produces. Naming it twice reads
    // as a mistake and tells the author less than "on it" does — which says the badge to look
    // at is the one on the card they just dropped.
    expect(reorderNoticeText(email, [entry('r1', [UNREADABLE], 'qa3')], labelOf)).toBe(
      'Moved "Email". This broke 1 rule on it.',
    );
  });

  it('points at the badges rather than listing items when several are affected', () => {
    const broken = [
      entry('r1', [UNREADABLE], 'qa1'),
      entry('r2', [UNREADABLE], 'qa3'),
      entry('r3', [UNREADABLE], 'qb1'),
    ];
    expect(reorderNoticeText(email, broken, labelOf)).toBe(
      'Moved "Email". This broke 3 rules — the affected questions are badged.',
    );
  });
});

describe('undoReorderMove', () => {
  const notice = { pageId: 'pA', questionId: 'qa3', originalIndex: 0 };

  it('moves the question back to where it came from', () => {
    expect(undoReorderMove(notice, ['qa1', 'qa2', 'qa3'])).toEqual({ from: 2, to: 0 });
  });

  it('finds the question by id, not by the index it was dropped at', () => {
    // Something above it was deleted while the band stood. Indices shifted; the id did not.
    expect(undoReorderMove(notice, ['qa2', 'qa3'])).toEqual({ from: 1, to: 0 });
  });

  it('refuses a question that is no longer there', () => {
    expect(undoReorderMove(notice, ['qa1', 'qa2'])).toBeNull();
  });

  it('refuses when the page itself is gone, which arrives as an empty list', () => {
    expect(undoReorderMove(notice, [])).toBeNull();
  });

  it('clamps the original index to the list that is there now', () => {
    // The question came from index 4 of a page that has since lost questions. Undo puts it as
    // far back as the page now goes rather than refusing, or splicing past the end.
    const late = { pageId: 'pA', questionId: 'qa1', originalIndex: 4 };
    expect(undoReorderMove(late, ['qa1', 'qa2'])).toEqual({ from: 0, to: 1 });
    expect(undoReorderMove(late, ['qa2', 'qa1'])).toBeNull();
  });

  it('refuses when the question is already back where it started', () => {
    expect(undoReorderMove(notice, ['qa3', 'qa1', 'qa2'])).toBeNull();
  });
});

// --- the two-page fixture the ordering claims are checked against ------------

const showWhenAnswered = (questionId: string): ConditionalRule => ({
  show: { all: [{ questionId, op: 'isAnswered' }] },
});

/**
 * A form carrying one of every rule shape whose readability an ordering change could touch:
 * a page `show` reading an EARLIER page, a page `jump` reading its OWN page, a question rule
 * reading across pages, a jump targeting a question on the other page, and same-page rules on
 * both sections. The claim of §1.6 is only worth testing against a fixture that could falsify it.
 */
function propertyForm(pageA: string[], pageB: string[]): RuleInventoryForm {
  const label = (id: string): string => id.toUpperCase();
  const rules: Record<string, ConditionalRule> = {
    qa2: {
      jump: [{ when: { all: [{ questionId: 'qa1', op: 'isAnswered' }] }, target: { kind: 'question', id: 'qb2' } }],
    },
    qa3: showWhenAnswered('qa1'),
    qb1: showWhenAnswered('qa3'),
    qb3: showWhenAnswered('qb1'),
  };
  return {
    // Derived from the pages rather than listed, so the fixture cannot describe a form whose
    // `sources` and `pages` disagree — `rules-inventory.spec.ts`'s `form()` records what that
    // impossible state costs when a spec is allowed to build it.
    sources: [...pageA, ...pageB].map(
      (id): ConditionalSourceQuestion => ({ id, prompt: label(id), kind: 'text' }),
    ),
    endings: [],
    pages: [
      {
        id: 'pA',
        label: 'Page A',
        questions: pageA.map((id) => ({ id, label: label(id), conditionalRule: rules[id] })),
      },
      {
        id: 'pB',
        label: 'Page B',
        // Reads an earlier page; leaves on what was just answered on this one.
        conditionalRule: {
          ...showWhenAnswered('qa1'),
          jump: [{ when: { all: [{ questionId: 'qb1', op: 'isAnswered' }] }, target: { kind: 'submit' } }],
        },
        questions: pageB.map((id) => ({ id, label: label(id), conditionalRule: rules[id] })),
      },
    ],
  };
}

const PAGE_A = ['qa1', 'qa2', 'qa3'];
const PAGE_B = ['qb1', 'qb2', 'qb3'];

describe('only rules on the moved page can newly break', () => {
  it('holds for every legal within-page move, on both sections', () => {
    // Brute force rather than argued (§1.6). This is also the canary: it fails the day
    // cross-section moves or section reordering land, which is the day the drag diff has to
    // widen beyond the moved page.
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    for (const [pageId, page] of [['pA', PAGE_A], ['pB', PAGE_B]] as const) {
      for (let from = 0; from < page.length; from += 1) {
        for (let to = 0; to < page.length; to += 1) {
          if (!isValidReorder(from, to, page.length)) {
            continue;
          }
          const order = moved(page, from, to);
          const after = collectRuleEntries(
            pageId === 'pA' ? propertyForm(order, PAGE_B) : propertyForm(PAGE_A, order),
          );
          for (const broken of newlyBrokenRules(before, after)) {
            expect({ pageId, from, to, itemId: broken.itemId }).toEqual({
              pageId,
              from,
              to,
              itemId: expect.stringContaining(pageId === 'pA' ? 'qa' : 'qb'),
            });
          }
        }
      }
    }
  });

  it('is not vacuously true — the same moves DO break same-page rules', () => {
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    // "A3 shows when A1 is answered", with A1 dragged below A3.
    const afterA = collectRuleEntries(propertyForm(moved(PAGE_A, 0, 2), PAGE_B));
    expect(newlyBrokenRules(before, afterA).map((e) => e.itemId).sort()).toEqual(['qa2', 'qa3']);

    // "B3 shows when B1 is answered", with B1 dragged below B3.
    const afterB = collectRuleEntries(propertyForm(PAGE_A, moved(PAGE_B, 0, 2)));
    expect(newlyBrokenRules(before, afterB).map((e) => e.itemId)).toEqual(['qb3']);
  });
});

describe('an appended question cannot break a rule', () => {
  it('reports nothing when a question lands at the end of a page', () => {
    // §1.5: every non-reorder write path appends or removes, and neither inverts a surviving
    // pair. It is the reason the drag notice hooks one method, so it is worth a spec.
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    const after = collectRuleEntries(propertyForm([...PAGE_A, 'qa4'], PAGE_B));
    expect(newlyBrokenRules(before, after)).toEqual([]);
  });
});
