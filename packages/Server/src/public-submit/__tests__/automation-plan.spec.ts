import { describe, expect, it } from 'vitest';
import type { AnswerValue, PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import { planAutomations } from '../automation-plan';

/** A minimal active automation; override just the field under test. */
function automation(overrides: Partial<PublishedFormAutomation> = {}): PublishedFormAutomation {
  return {
    id: 'auto-1',
    name: 'An automation',
    targetType: 'Action',
    actionId: 'act-1',
    trigger: 'OnComplete',
    executionMode: 'Sync',
    displayOrder: 1,
    continueOnError: true,
    isActive: true,
    ...overrides,
  };
}

const noAnswers = new Map<string, AnswerValue>();

/** A rule that cannot hold for `noAnswers` — the question it names was never answered. */
const neverMatches = { show: { all: [{ questionId: 'q-optin', op: 'equals' as const, value: 'Yes' }] } };

describe('planAutomations', () => {
  describe('what applies at all', () => {
    it('plans an active automation whose trigger matches a complete submission', () => {
      const plan = planAutomations([automation()], { complete: true, answers: noAnswers });

      expect(plan).toHaveLength(1);
      expect(plan[0].automation.id).toBe('auto-1');
      expect(plan[0].outcome).toBe('run');
    });

    it('omits an inactive automation', () => {
      const plan = planAutomations([automation({ isActive: false })], { complete: true, answers: noAnswers });

      expect(plan).toEqual([]);
    });
  });

  describe('triggers', () => {
    it('does not fire an OnComplete automation on a partial autosave', () => {
      const plan = planAutomations([automation({ trigger: 'OnComplete' })], {
        complete: false,
        answers: noAnswers,
      });

      expect(plan).toEqual([]);
    });

    it('fires an OnPartial automation only on a partial autosave', () => {
      const partial = automation({ trigger: 'OnPartial' });

      expect(planAutomations([partial], { complete: false, answers: noAnswers })).toHaveLength(1);
      expect(planAutomations([partial], { complete: true, answers: noAnswers })).toEqual([]);
    });

    it('fires an OnCompleteOrPartial automation on both', () => {
      const both = automation({ trigger: 'OnCompleteOrPartial' });

      expect(planAutomations([both], { complete: false, answers: noAnswers })).toHaveLength(1);
      expect(planAutomations([both], { complete: true, answers: noAnswers })).toHaveLength(1);
    });
  });

  describe('order', () => {
    it('runs every Sync automation before any Async one', () => {
      const plan = planAutomations(
        [
          automation({ id: 'async-first', executionMode: 'Async', displayOrder: 1 }),
          automation({ id: 'sync-later', executionMode: 'Sync', displayOrder: 2 }),
        ],
        { complete: true, answers: noAnswers },
      );

      // Sync wins over DisplayOrder: an Async automation is dispatched without being awaited, so
      // anything that must observe its effect could not rely on running "after" it anyway. What a
      // later automation CAN rely on is a Sync one having finished — which is how a binding's
      // created record becomes available to the confirmation email configured after it.
      expect(plan.map((p) => p.automation.id)).toEqual(['sync-later', 'async-first']);
    });

    it('orders by DisplayOrder within an execution mode', () => {
      const plan = planAutomations(
        [
          automation({ id: 'third', displayOrder: 30 }),
          automation({ id: 'first', displayOrder: 10 }),
          automation({ id: 'second', displayOrder: 20 }),
        ],
        { complete: true, answers: noAnswers },
      );

      expect(plan.map((p) => p.automation.id)).toEqual(['first', 'second', 'third']);
    });

    it('keeps a condition-skipped automation in its ordered position', () => {
      const plan = planAutomations(
        [
          automation({ id: 'runs', displayOrder: 1 }),
          automation({ id: 'skipped', displayOrder: 2, conditionalRule: neverMatches }),
          automation({ id: 'also-runs', displayOrder: 3 }),
        ],
        { complete: true, answers: noAnswers },
      );

      expect(plan.map((p) => [p.automation.id, p.outcome])).toEqual([
        ['runs', 'run'],
        ['skipped', 'skipped-condition'],
        ['also-runs', 'run'],
      ]);
    });

    it('keeps authoring order for automations that share a DisplayOrder', () => {
      const plan = planAutomations(
        [automation({ id: 'a', displayOrder: 1 }), automation({ id: 'b', displayOrder: 1 })],
        { complete: true, answers: noAnswers },
      );

      // Nothing stops an author giving two automations the same order, and an arbitrary tiebreak
      // would make the run order differ between deploys for no visible reason.
      expect(plan.map((p) => p.automation.id)).toEqual(['a', 'b']);
    });
  });
});
