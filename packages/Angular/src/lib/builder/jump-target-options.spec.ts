import { describe, expect, it } from 'vitest';
import {
  groupedJumpTargets,
  jumpTargetOptions,
  storedTargetLabel,
  targetFromValue,
  targetValue,
} from './jump-target-options';

const QUESTIONS = [{ id: 'q8', label: 'Are you local?' }];
const PAGES = [{ id: 'p3', label: 'VIP details' }];
const ENDINGS = [{ id: 's1', label: 'Not eligible' }];

/** Every destination the form has, wherever it sits — what the host wires as `formTargets`. */
const ALL = jumpTargetOptions(QUESTIONS, PAGES, ENDINGS);

describe('encoding a target for a <select>', () => {
  describe('happy', () => {
    it('round-trips every kind', () => {
      for (const target of [
        { kind: 'question', id: 'q8' },
        { kind: 'page', id: 'p3' },
        { kind: 'ending', id: 's1' },
        { kind: 'submit' },
      ] as const) {
        expect(targetFromValue(targetValue(target))).toEqual(target);
      }
    });
  });

  describe('edge', () => {
    it('survives an id containing a colon', () => {
      // Ids are GUIDs today, but the encoding splits on the FIRST colon precisely so a colon in
      // an id cannot silently truncate the target.
      expect(targetFromValue(targetValue({ kind: 'question', id: 'a:b:c' }))).toEqual({
        kind: 'question',
        id: 'a:b:c',
      });
    });
  });

  describe('worst', () => {
    it('refuses anything it does not understand rather than guessing', () => {
      for (const value of ['', 'question', 'question:', ':q8', 'planet:mars', 'nonsense']) {
        expect(targetFromValue(value)).toBeUndefined();
      }
    });
  });
});

describe('jumpTargetOptions', () => {
  describe('happy', () => {
    it('offers what the caller supplied, plus Submit', () => {
      expect(jumpTargetOptions(QUESTIONS, PAGES, ENDINGS).map((o) => o.label)).toEqual([
        'Are you local?',
        'VIP details',
        'Not eligible',
        'Submit the form',
      ]);
    });

    it('always offers Submit, even on a form with nothing else to point at', () => {
      expect(jumpTargetOptions([], [], []).map((o) => o.value)).toEqual(['submit']);
    });
  });

  describe('edge', () => {
    it('groups for rendering and skips empty groups', () => {
      // Grouping now takes the form's sections, so it can nest each section's questions under it
      // rather than listing every question flat — see `section-groups.spec.ts` for that. The
      // assertion here is unchanged and still the one worth making: a group nothing landed in is
      // not rendered, so an empty `Endings` optgroup never appears above `Finish`.
      expect(groupedJumpTargets(jumpTargetOptions([], [], ENDINGS), []).map((g) => g.group)).toEqual([
        'Endings',
        'Finish',
      ]);
    });
  });

  describe('worst', () => {
    it('names a stored target the picker no longer offers, rather than rendering blank', () => {
      // A <select> whose value is absent from its options renders EMPTY — an author would see a
      // blank destination on a rule that reads perfectly well in the database.
      const options = jumpTargetOptions(QUESTIONS, PAGES, ENDINGS);
      expect(storedTargetLabel({ kind: 'question', id: 'gone' }, options, ALL)).toBe(
        '(a question that no longer exists)',
      );
      expect(storedTargetLabel({ kind: 'question', id: 'q8' }, options, ALL)).toBe('Are you local?');
    });

    it('says a target is BEHIND the rule rather than calling it deleted', () => {
      // The lie issue #73 fixed for sources, on destinations. A reorder can put a target behind
      // its rule; the picker is forward-only, so it drops out of the offered list while sitting
      // one row up the canvas, visibly present. Saying "no longer exists" about it is the badge
      // caught lying — and this one is on the row an author opens to fix the rule.
      const offered = jumpTargetOptions([], [], ENDINGS);
      expect(storedTargetLabel({ kind: 'question', id: 'q8' }, offered, ALL)).toBe(
        'Are you local? — no longer ahead, so this rule never runs',
      );
      expect(storedTargetLabel({ kind: 'page', id: 'p3' }, offered, ALL)).toBe(
        'VIP details — no longer ahead, so this rule never runs',
      );
    });

    it('never says that about Submit, which is always ahead of everything', () => {
      expect(storedTargetLabel({ kind: 'submit' }, [], [])).toBe('Submit the form');
    });

    it('keeps the old wording for a host that has not wired the form-wide list', () => {
      // Empty is the safe default: with no evidence about where the target sits, the honest
      // answer is the one that makes no ordering claim.
      expect(storedTargetLabel({ kind: 'question', id: 'q8' }, [], [])).toBe(
        '(a question that no longer exists)',
      );
    });

    it('tells an ending that was deleted from one that is simply not offered here', () => {
      // An ending is reachable from anywhere, so a picker that omits one omits it deliberately.
      expect(storedTargetLabel({ kind: 'ending', id: 's1' }, [], ALL)).toBe(
        'Not eligible — no longer ahead, so this rule never runs',
      );
      // "an ending screen" is what the badge calls one (`MISSING_ENDING`); the rail and the
      // badge are read together, and "a ending" was never right anyway.
      expect(storedTargetLabel({ kind: 'ending', id: 'gone' }, [], ALL)).toBe(
        '(an ending screen that no longer exists)',
      );
    });
  });
});
