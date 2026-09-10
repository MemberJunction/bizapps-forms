import { describe, it, expect } from 'vitest';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import type { ConditionalSourceQuestion } from './condition-sources';
import { collectRuleEntries, type RuleEntry, type RuleInventoryForm } from './rules-inventory';
import {
  damageKeys,
  isValidCrossPageMove,
  isValidReorder,
  newlyBrokenRules,
  noticeStillTrue,
  reorderNoticeText,
  undoReorderMove,
} from './reorder';

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
  /** A band raised on pA. Where the question is now is the caller's to state, not the band's. */
  const band = (questionId: string, wasBefore: string | null) => ({
    fromPageId: 'pA',
    questionId,
    wasBefore,
  });

  /** The question is still on the page it came from: an in-page undo. */
  const inPageUndo = (
    n: ReturnType<typeof band>,
    ids: readonly string[],
  ) => undoReorderMove(n, 'pA', ids, ids);

  /** The question sits on pB now and belongs back on pA: a cross-page undo. */
  const crossedUndo = (
    n: ReturnType<typeof band>,
    onPB: readonly string[],
    home: readonly string[],
  ) => undoReorderMove(n, 'pB', onPB, home);

  describe('happy', () => {
    it('moves the question back in front of the one it used to precede', () => {
      const n = band('qa1', 'qa2');
      const ids = ['qa2', 'qa3', 'qa1'];
      expect(inPageUndo(n, ids)).toEqual({ from: 2, to: 0, toPageId: 'pA' });
    });

    it('survives an unrelated move made while the band stood', () => {
      const n = band('qa1', 'qa2');
      const ids = ['qa3', 'qa2', 'qa1'];
      expect(inPageUndo(n, ids)).toEqual({ from: 2, to: 1, toPageId: 'pA' });
    });

    it('finds both the question and its anchor by id, not by index', () => {
      const n = band('qa1', 'qa3');
      const ids = ['qa2', 'qa3', 'qa1'];
      expect(inPageUndo(n, ids)).toEqual({ from: 2, to: 1, toPageId: 'pA' });
    });

    it('puts a question that was LAST back at the end', () => {
      const n = band('qa1', null);
      const ids = ['qa1', 'qa2', 'qa3'];
      expect(inPageUndo(n, ids)).toEqual({ from: 0, to: 2, toPageId: 'pA' });
    });
  });

  describe('the page it is on NOW', () => {
    // The band records where the question came FROM, which is history and cannot go stale. Where
    // it IS is a different kind of fact: a later move that breaks nothing new deliberately leaves
    // a standing band alone, and since #149 such a move can change the question's page. So the
    // caller states the current page at click time rather than the band remembering it.
    it('takes the current page from the caller, not from the notice', () => {
      // Raised by an IN-PAGE reorder on pA, so a band that remembered its own page would say pA.
      // The question has since been dragged to pB. Undo must treat this as a CROSS-page undo:
      // the removal happens in pB's array, so pA's indices do not shift and the anchor's index
      // is the answer as-is. Reading a remembered 'pA' would apply the in-page splice-out
      // correction and land it one position early.
      const n = { fromPageId: 'pA', questionId: 'qa1', wasBefore: 'qa4' };
      expect(undoReorderMove(n, 'pB', ['qa1', 'qb1'], ['qa2', 'qa3', 'qa4'])).toEqual({
        from: 0,
        to: 2,
        toPageId: 'pA',
      });
    });

    it('is an in-page undo when the current page IS the home page', () => {
      const n = { fromPageId: 'pA', questionId: 'qa1', wasBefore: 'qa3' };
      const ids = ['qa2', 'qa3', 'qa1'];
      expect(undoReorderMove(n, 'pA', ids, ids)).toEqual({ from: 2, to: 1, toPageId: 'pA' });
    });
  });

  describe('edge', () => {
    it('sends a crossed question back to the page it came from', () => {
      // It sits on pB now; home is pA, where it used to sit in front of qa2.
      const n = band('qa1', 'qa2');
      expect(crossedUndo(n, ['qb1', 'qa1'], ['qa2', 'qa3'])).toEqual({
        from: 1,
        to: 0,
        toPageId: 'pA',
      });
    });

    it('does NOT apply the splice-out correction across pages', () => {
      // In-page, removing the question shifts an anchor that sat AFTER it down by one, so the
      // insert index is `anchor - 1`. Across pages the removal happens in the OTHER array, so
      // the home page's indices do not move and the anchor's index is the answer as-is.
      // `qa3` is at home index 2; the undo must land at 2, not 1.
      const n = band('qa1', 'qa3');
      expect(crossedUndo(n, ['qa1'], ['qa2', 'qb9', 'qa3'])).toEqual({
        from: 0,
        to: 2,
        toPageId: 'pA',
      });
    });

    it('sends a crossed question that was LAST to index === length, not length - 1', () => {
      // The home array does not shrink on this removal, so "after everything" is `length`.
      const n = band('qa1', null);
      expect(crossedUndo(n, ['qa1'], ['qa2', 'qa3'])).toEqual({
        from: 0,
        to: 2,
        toPageId: 'pA',
      });
    });

    it('sends a crossed question home to a section that is now empty', () => {
      // The move that emptied the section is exactly the one most worth undoing.
      const n = band('qa1', null);
      expect(crossedUndo(n, ['qb1', 'qa1'], [])).toEqual({
        from: 1,
        to: 0,
        toPageId: 'pA',
      });
    });
  });

  describe('worst', () => {
    it('refuses a question that is no longer there', () => {
      const n = band('gone', 'qa2');
      const ids = ['qa1', 'qa2', 'qa3'];
      expect(inPageUndo(n, ids)).toBeNull();
    });

    it('refuses when the page itself is gone, which arrives as an empty list', () => {
      const n = band('qa1', 'qa2');
      expect(inPageUndo(n, [])).toBeNull();
    });

    it('refuses when the HOME page is gone, which also arrives as an empty list', () => {
      // A crossed question whose original section was deleted while the band stood. `wasBefore`
      // names an anchor that is not in the empty home list, so this refuses through the same
      // path as a deleted anchor rather than through a branch of its own.
      const n = band('qa1', 'qa2');
      expect(crossedUndo(n, ['qb1', 'qa1'], [])).toBeNull();
    });

    it('refuses when the anchor was deleted, rather than guessing a position', () => {
      // Where "before qa1" is on a page with no qa1 is a question with no answer. A band offering
      // a move whose destination has to be invented is worse than a band that has lapsed.
      const n = band('qa1', 'gone');
      const ids = ['qa2', 'qa3', 'qa1'];
      expect(inPageUndo(n, ids)).toBeNull();
    });

    it('refuses when the question is already back where it started', () => {
      const n = band('qa1', 'qa2');
      const ids = ['qa3', 'qa1', 'qa2'];
      expect(inPageUndo(n, ids)).toBeNull();
    });

    it('never resolves a CROSSED undo to a no-op, because the pages differ', () => {
      // The in-page `to === from` refusal must not fire here: the indices belong to different
      // lists, and putting the question on another page is never "already there".
      const n = band('qa1', 'qa2');
      expect(crossedUndo(n, ['qa1'], ['qa2'])).toEqual({ from: 0, to: 0, toPageId: 'pA' });
    });

    it('resolves against where the anchor is NOW, which is the limit of what one anchor can do', () => {
      // Pinned as a known edge, not as a claim to have solved it. No single neighbour survives
      // being moved itself: undoing one move while a second has reordered the same pair has no
      // unique right answer, and inventing one would move the author's question somewhere neither
      // of them asked for. Refusing is the honest end of it — the BADGE still says the rule is
      // broken, which is the half that must never be wrong.
      const n = band('qa1', 'qa2');
      const ids = ['qa1', 'qa2', 'qa3'];
      expect(inPageUndo(n, ids)).toBeNull();
    });
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
    // Brute force rather than argued (§1.6). Still true after #149: a move INSIDE one section
    // cannot invert any pair involving a question in another, so the in-page drag's damage is
    // page-local. What #149 changed is that this is no longer the only kind of move.
    //
    // IT WAS NEVER THE CANARY IT CLAIMED TO BE. The comment here used to promise it "fails the
    // day cross-section moves land". It does not, and it did not: it only ever iterates
    // within-page moves, so the property it brute-forces stayed true and the block stayed green
    // through the change it was supposed to catch. The cross-section block below is the one that
    // actually states what a move between sections can break.
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

/**
 * The property the within-page block cannot state, and the reason the damage diff was never
 * scoped to one page (issue #149).
 *
 * A cross-section move changes the position of the moved question relative to EVERY question on
 * both pages at once, so it can break a rule on the source section, on the destination section,
 * or on any page downstream of either. `newlyBrokenRules` is a set difference over
 * `collectRuleEntries` for the whole tree, so it reports all of them without knowing it is doing
 * anything new — which is exactly why the write path only had to be hooked, not taught.
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

  it('reports damage for every legal move out of A into B without inventing a rule', () => {
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    for (let from = 0; from < PAGE_A.length; from += 1) {
      for (let to = 0; to <= PAGE_B.length; to += 1) {
        const { a, b } = across(PAGE_A, PAGE_B, from, to);
        const after = collectRuleEntries(propertyForm(a, b));
        // Every reported id is a real rule on the form — the diff never mints one.
        const ids = new Set(after.map((e) => e.id));
        for (const broken of newlyBrokenRules(before, after)) {
          expect(ids.has(broken.id)).toBe(true);
          expect(broken.broken.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is not vacuously true: one move breaks rules on BOTH sections at once', () => {
    // Three rules read A1: "A3 shows when A1 is answered", A2's jump condition, and — the one
    // that makes this a cross-section property rather than a source-section one — section B's
    // OWN show rule. Dragging A1 out of A and into B puts it after the first two and INSIDE the
    // third's section, so a page rule that runs before B's questions now reads a blank.
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    const { a, b } = across(PAGE_A, PAGE_B, 0, PAGE_B.length);
    const after = collectRuleEntries(propertyForm(a, b));
    expect(newlyBrokenRules(before, after).map((e) => e.itemId).sort()).toEqual([
      'pB',
      'qa2',
      'qa3',
    ]);
  });

  it('reports damage on the SOURCE section, which a destination-scoped diff would miss', () => {
    // What makes "diff the whole tree" load-bearing rather than incidental. The author dropped
    // the question into section B; two of the rules that broke are on section A, which they are
    // no longer looking at. A diff scoped to the page the drop landed on would report neither,
    // and the band would under-report a move that cost two rules.
    const before = collectRuleEntries(propertyForm(PAGE_A, PAGE_B));
    const { a, b } = across(PAGE_A, PAGE_B, 0, 0);
    const after = collectRuleEntries(propertyForm(a, b));
    const onSourcePage = newlyBrokenRules(before, after)
      .filter((e) => e.pageId === 'pA')
      .map((e) => e.itemId)
      .sort();
    expect(onSourcePage).toEqual(['qa2', 'qa3']);
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

/**
 * A `Statement` is a legal jump destination and never an answer source, so it is the one item
 * whose presence on the page and absence from `sources` differ — the case that made the whole
 * class of "jump to a question" reorder invisible to the band.
 */
describe('a jump to a Statement', () => {
  const statementForm = (order: readonly string[]): RuleInventoryForm => ({
    sources: [{ id: 'qa1', prompt: 'Ticket type', kind: 'text' }],
    endings: [],
    pages: [
      {
        id: 'pA',
        label: 'Page A',
        questions: order.map((id) => ({
          id,
          label: id === 'st1' ? 'Please read the terms' : id,
          conditionalRule:
            id === 'qa1'
              ? { jump: [{ when: { all: [{ questionId: 'qa1', op: 'isAnswered' }] }, target: { kind: 'question', id: 'st1' } }] }
              : undefined,
        })),
      },
    ],
  });

  it('is healthy while the Statement is ahead of the rule', () => {
    expect(collectRuleEntries(statementForm(['qa1', 'st1']))[0].broken).toEqual([]);
  });

  it('breaks — and is REPORTED — when the reorder puts the Statement behind it', () => {
    const before = collectRuleEntries(statementForm(['qa1', 'st1']));
    const after = collectRuleEntries(statementForm(['st1', 'qa1']));
    expect(newlyBrokenRules(before, after).map((e) => e.broken)).toEqual([
      ['a destination that is no longer ahead of it, so the rule never runs'],
    ]);
  });
});

describe('noticeStillTrue', () => {
  const notice = (broken: RuleEntry[]) => ({ damage: damageKeys(broken) });

  it('holds while a rule the band named is still broken for the reason it named', () => {
    expect(noticeStillTrue(notice([entry('r1', [UNREADABLE])]), [entry('r1', [UNREADABLE])])).toBe(true);
  });

  it('lapses once every reason it named is repaired', () => {
    // The author dragged the question back BY HAND rather than clicking Undo. Same recovery,
    // and the band must not go on describing a breakage that is no longer there.
    expect(noticeStillTrue(notice([entry('r1', [UNREADABLE])]), [entry('r1', [])])).toBe(false);
  });

  it('lapses when the reason the MOVE added is repaired, though older breakage remains', () => {
    // The band is about what THIS move cost. A rule that was already pointing at a deleted
    // question, and which the move also made unreadable, has had the move's damage undone the
    // moment it is readable again — the badge goes on saying the rest, which is its job. Keyed
    // on rule ids alone the band stood there offering to Undo a move that had already been
    // undone, and named a consequence that was no longer one.
    expect(noticeStillTrue(notice([entry('r1', [UNREADABLE])]), [entry('r1', [MISSING])])).toBe(false);
  });

  it('holds while the exact reason it named survives alongside another', () => {
    const live = [entry('r1', [MISSING, UNREADABLE])];
    expect(noticeStillTrue(notice([entry('r1', [UNREADABLE])]), live)).toBe(true);
  });

  it('lapses when the rule it named no longer exists at all', () => {
    // Deleted with its question. Gone is not broken.
    expect(noticeStillTrue(notice([entry('r1', [UNREADABLE])]), [])).toBe(false);
  });

  it('holds while ANY of several named reasons is still live', () => {
    const named = [entry('r1', [UNREADABLE]), entry('r2', [UNREADABLE], 'qa2')];
    expect(noticeStillTrue(notice(named), [entry('r1', []), entry('r2', [UNREADABLE], 'qa2')])).toBe(true);
  });

  it('is false for a notice that named nothing, which is not a state the builder can reach', () => {
    // `reorderNoticeText` returns '' for an empty diff, so no notice is raised without rules.
    // Pinned anyway: "no damage named" must read as nothing to say, never as always-true.
    expect(noticeStillTrue({ damage: [] }, [entry('r1', [UNREADABLE])])).toBe(false);
  });

  it('does not confuse one rule\'s reason for another rule\'s', () => {
    // The keys are pairs, so the same reason on a DIFFERENT rule is a different fact.
    expect(noticeStillTrue(notice([entry('r1', [UNREADABLE])]), [entry('r2', [UNREADABLE], 'qa2')])).toBe(false);
  });
});
