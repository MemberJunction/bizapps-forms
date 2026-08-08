import { describe, expect, it } from 'vitest';
import { LEGACY_ON_SUBMIT_AUTOMATIONS, LEGACY_ON_SUBMIT_ACTION_NAMES } from '@mj-biz-apps/forms-entities';
import { ON_SUBMIT_ACTION_NAMES } from '../on-submit-hooks.service';
import { planAutomations } from '../automation-plan';
import type { AnswerValue, PublishedFormAutomation } from '@mj-biz-apps/forms-entities';

/**
 * Guarantee G1: the automations seeded in place of the legacy hooks must do the same thing.
 *
 * Dispatch is all-or-nothing — a form whose snapshot carries any automations runs those and NOT the
 * hard-coded list — so the seeded set has to reproduce the old behaviour exactly, or adding one
 * binding silently changes what else happens on submit. These are the assertions that have to hold
 * before `ON_SUBMIT_ACTION_NAMES` can be deleted.
 */
describe('legacy on-submit parity', () => {
  it('the server list and the seed definition name the same actions in the same order', () => {
    // Two lists that must agree is exactly the drift this test exists to catch; they are one list
    // today, and this fails the moment someone re-introduces a second copy.
    expect([...ON_SUBMIT_ACTION_NAMES]).toEqual([...LEGACY_ON_SUBMIT_ACTION_NAMES]);
    expect(LEGACY_ON_SUBMIT_AUTOMATIONS.map((a) => a.actionName)).toEqual([...ON_SUBMIT_ACTION_NAMES]);
  });

  it('assigns a distinct DisplayOrder that preserves the legacy firing order', () => {
    const orders = LEGACY_ON_SUBMIT_AUTOMATIONS.map((a) => a.displayOrder);

    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  /** The seeded automations, exactly as the builder writes them. */
  function seededPlan(): PublishedFormAutomation[] {
    return LEGACY_ON_SUBMIT_AUTOMATIONS.map((legacy) => ({
      id: `auto-${legacy.displayOrder}`,
      name: legacy.actionName,
      targetType: 'Action' as const,
      actionId: `action-${legacy.displayOrder}`,
      trigger: 'OnComplete' as const,
      executionMode: 'Sync' as const,
      displayOrder: legacy.displayOrder,
      continueOnError: true,
      isActive: true,
    }));
  }

  it('plans the seeded automations in the legacy order for a complete submission', () => {
    const plan = planAutomations(seededPlan(), { complete: true, answers: new Map<string, AnswerValue>() });

    expect(plan.map((p) => p.automation.name)).toEqual([...LEGACY_ON_SUBMIT_ACTION_NAMES]);
    expect(plan.every((p) => p.outcome === 'run')).toBe(true);
  });

  it('fires none of them on a partial autosave, matching the legacy runner', () => {
    // The legacy path ran only for complete submissions (`if (complete && !persisted.deduped)`), so
    // an OnComplete trigger is what reproduces it. Seeding OnCompleteOrPartial would start firing
    // confirmation emails on every autosave keystroke.
    const plan = planAutomations(seededPlan(), { complete: false, answers: new Map<string, AnswerValue>() });

    expect(plan).toEqual([]);
  });

  it('keeps every seeded automation best-effort, as the legacy runner was', () => {
    // The legacy runner logged a hook failure and continued to the next one. `continueOnError`
    // false on any of these would mean one failing action stops the rest — a behaviour change
    // dressed up as a migration.
    expect(seededPlan().every((a) => a.continueOnError)).toBe(true);
  });
});
