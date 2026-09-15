import { describe, expect, it } from 'vitest';
import { LEGACY_ON_SUBMIT_ACTION_NAMES } from '@mj-biz-apps/forms-entities';

import {
  LEGACY_STEP_DESCRIPTIONS,
  describeFailure,
  describeTiming,
  describeTrigger,
  describeWhat,
  isLegacyStepName,
  orderForExecution,
  stepDisplayName,
  submitSummary,
  toSubmitSteps,
  type AutomationFacts,
} from './automation-steps';

function facts(over: Partial<AutomationFacts> = {}): AutomationFacts {
  return {
    id: 'a1',
    name: 'Send responses to People',
    targetType: 'EntityBinding',
    executionMode: 'Sync',
    trigger: 'OnComplete',
    continueOnError: true,
    isActive: true,
    displayOrder: 1,
    ...over,
  };
}

describe('orderForExecution', () => {
  it('runs every Sync step before any Async one, whatever their DisplayOrder says', () => {
    // The defect this exists for: the old tab sorted on DisplayOrder alone, so this pair was
    // shown async-first while the server ran it sync-first.
    const ordered = orderForExecution([
      facts({ id: 'async', executionMode: 'Async', displayOrder: 1 }),
      facts({ id: 'sync', executionMode: 'Sync', displayOrder: 2 }),
    ]);
    expect(ordered.map((f) => f.id)).toEqual(['sync', 'async']);
  });

  it('orders within a mode by DisplayOrder', () => {
    const ordered = orderForExecution([
      facts({ id: 'third', displayOrder: 3 }),
      facts({ id: 'first', displayOrder: 1 }),
      facts({ id: 'second', displayOrder: 2 }),
    ]);
    expect(ordered.map((f) => f.id)).toEqual(['first', 'second', 'third']);
  });

  it('breaks a shared DisplayOrder by authoring order rather than arbitrarily', () => {
    const ordered = orderForExecution([
      facts({ id: 'authored-first', displayOrder: 5 }),
      facts({ id: 'authored-second', displayOrder: 5 }),
    ]);
    expect(ordered.map((f) => f.id)).toEqual(['authored-first', 'authored-second']);
  });
});

describe('toSubmitSteps', () => {
  it('numbers only the steps that will actually run', () => {
    const steps = toSubmitSteps([
      facts({ id: 'on-1', displayOrder: 1 }),
      facts({ id: 'off', displayOrder: 2, isActive: false }),
      facts({ id: 'on-2', displayOrder: 3 }),
    ]);
    expect(steps.map((s) => [s.id, s.position])).toEqual([
      ['on-1', 1],
      ['off', null],
      ['on-2', 2],
    ]);
  });

  it('keeps a disabled step visible so it can be turned back on', () => {
    const steps = toSubmitSteps([facts({ isActive: false })]);
    expect(steps).toHaveLength(1);
    expect(steps[0].enabled).toBe(false);
  });

  it('labels each kind by what it does, never by its TargetType column', () => {
    const steps = toSubmitSteps([
      facts({ id: 'b', targetType: 'EntityBinding' }),
      facts({ id: 'x', targetType: 'Action' }),
      facts({ id: 'g', targetType: 'Agent' }),
    ]);
    expect(steps.map((s) => s.kindLabel)).toEqual([
      'Saves a record',
      'Runs an action',
      'Runs an AI agent',
    ]);
    expect(steps.some((s) => /EntityBinding|Sync|DisplayOrder/.test(s.kindLabel))).toBe(false);
  });
});

describe('describeWhat', () => {
  it('names the entity a binding writes to', () => {
    expect(describeWhat(facts({ targetEntity: 'People' }), 'record')).toBe(
      'Creates or updates a People record from the answers.',
    );
  });

  it('still says something useful when the entity could not be resolved', () => {
    expect(describeWhat(facts(), 'record')).toBe('Creates or updates a record from the answers.');
  });

  it("prefers the action's own description when it has one", () => {
    expect(describeWhat(facts({ description: 'Emails the respondent.' }), 'action')).toBe(
      'Emails the respondent.',
    );
  });

  it('ignores a blank description rather than rendering an empty sentence', () => {
    expect(describeWhat(facts({ description: '   ' }), 'agent')).toBe(
      'Hands the submission to this agent to work on.',
    );
  });
});

describe('describeTiming', () => {
  it('describes Sync as ordering, not as the respondent waiting', () => {
    const said = describeTiming(facts({ executionMode: 'Sync' }));
    expect(said).toBe('Runs in order, after the step before it has finished.');
    // Hooks are dispatched after the reply is sent, so any promise of a wait is false.
    expect(said).not.toMatch(/wait|respondent|submitting/i);
  });

  it('describes Async as running alongside the others', () => {
    expect(describeTiming(facts({ executionMode: 'Async' }))).toMatch(/straight away/);
  });
});

describe('describeFailure', () => {
  it('warns that a strict Sync step stops the ones after it', () => {
    expect(describeFailure(facts({ executionMode: 'Sync', continueOnError: false }))).toBe(
      'If it fails, the steps after it are skipped.',
    );
  });

  it('says the rest survive when the step is tolerant', () => {
    expect(describeFailure(facts({ executionMode: 'Sync', continueOnError: true }))).toBe(
      'If it fails, the steps after it still run.',
    );
  });

  it('does not threaten the sequence for an Async step, which was never in it', () => {
    expect(describeFailure(facts({ executionMode: 'Async', continueOnError: false }))).toBe(
      'If it fails, nothing else is affected.',
    );
  });
});

describe('describeTrigger', () => {
  it('says nothing about the ordinary trigger', () => {
    expect(describeTrigger(facts({ trigger: 'OnComplete' }))).toBeNull();
  });

  it('calls out the two that surprise', () => {
    expect(describeTrigger(facts({ trigger: 'OnPartial' }))).toMatch(/never on the finished/);
    expect(describeTrigger(facts({ trigger: 'OnCompleteOrPartial' }))).toMatch(/Also runs/);
  });
});

describe('submitSummary', () => {
  it('counts only what runs', () => {
    const steps = toSubmitSteps([facts({ id: 'a' }), facts({ id: 'b', isActive: false })]);
    expect(submitSummary(steps)).toBe('One thing happens after the answers are saved.');
  });

  it('tells the truth when everything is switched off', () => {
    const steps = toSubmitSteps([facts({ isActive: false })]);
    expect(submitSummary(steps)).toBe('Nothing happens after the answers are saved.');
  });

  it('reads as a sequence once there is more than one', () => {
    const steps = toSubmitSteps([facts({ id: 'a' }), facts({ id: 'b', displayOrder: 2 })]);
    expect(submitSummary(steps)).toBe('2 things happen, in this order, after the answers are saved.');
  });
});

describe('LEGACY_STEP_DESCRIPTIONS', () => {
  it('describes every built-in hook, so none is ever shown by its raw action name', () => {
    for (const name of LEGACY_ON_SUBMIT_ACTION_NAMES) {
      expect(LEGACY_STEP_DESCRIPTIONS[name]).toBeTruthy();
      expect(LEGACY_STEP_DESCRIPTIONS[name]).not.toContain('Forms:');
    }
  });

  it('says nothing an author would have to already know our vocabulary to read', () => {
    const all = Object.values(LEGACY_STEP_DESCRIPTIONS).join(' ');
    expect(all).not.toMatch(/upsert|entity binding|automation run/i);
  });
});

describe('stepDisplayName', () => {
  it("drops our own namespace, which the author is already inside", () => {
    expect(stepDisplayName('Forms: Send Confirmation Email')).toBe('Send Confirmation Email');
  });

  it('leaves an ordinary name alone', () => {
    expect(stepDisplayName('Send responses to People')).toBe('Send responses to People');
  });

  it('keeps the original rather than rendering an empty title', () => {
    expect(stepDisplayName('Forms:')).toBe('Forms:');
  });
});

describe('isLegacyStepName', () => {
  it('recognises every built-in hook', () => {
    for (const name of LEGACY_ON_SUBMIT_ACTION_NAMES) {
      expect(isLegacyStepName(name)).toBe(true);
    }
  });

  it('does not claim an author-added action is built in', () => {
    expect(isLegacyStepName('Forms: Something Else')).toBe(false);
  });
});
