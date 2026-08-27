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
      expect(groupedJumpTargets(jumpTargetOptions([], [], ENDINGS)).map((g) => g.group)).toEqual([
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
      expect(storedTargetLabel({ kind: 'question', id: 'gone' }, options)).toBe(
        '(a question that no longer exists)',
      );
      expect(storedTargetLabel({ kind: 'question', id: 'q8' }, options)).toBe('Are you local?');
    });
  });
});
