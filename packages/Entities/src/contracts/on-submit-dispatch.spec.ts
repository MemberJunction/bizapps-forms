import { describe, expect, it } from 'vitest';
import { hasUnreachableAutomations, resolveOnSubmitDispatch } from './on-submit-dispatch';
import type { PublishedFormAutomation } from './form-definition';

/** A form that configures nothing and says nothing about it — every snapshot published to date. */
function input(
  onSubmitMode?: 'Legacy' | 'Configured',
  automations: readonly PublishedFormAutomation[] = [],
) {
  return { settings: { onSubmitMode }, automations };
}

/** A minimal well-formed automation — the contents never matter here, only that one exists. */
function automation(): PublishedFormAutomation {
  return {
    id: 'auto-1',
    name: 'Forms: Send Confirmation Email',
    targetType: 'Action',
    actionId: 'action-1',
    trigger: 'OnComplete',
    executionMode: 'Sync',
    displayOrder: 1,
    continueOnError: true,
    isActive: true,
  };
}

describe('resolveOnSubmitDispatch', () => {
  it('runs nothing when a form declares its automations authoritative and has none', () => {
    // bizapps-forms#47. Before this existed, `automations: []` was indistinguishable from "never
    // configured", so a consumer that owns its own subject identity had no way to decline
    // `Forms: Upsert Respondent Person` and got a duplicate Person on every submission.
    const dispatch = resolveOnSubmitDispatch(input('Configured'));

    expect(dispatch.kind).toBe('configured');
    expect(dispatch.kind === 'configured' && dispatch.automations).toEqual([]);
  });

  it('still infers "configured" from a non-empty list when no mode is declared', () => {
    // Every snapshot published before `onSubmitMode` existed carries no mode, so the inference is
    // what keeps those forms running the automations they were published with.
    const dispatch = resolveOnSubmitDispatch(input(undefined, [automation()]));

    expect(dispatch.kind).toBe('configured');
    expect(dispatch.kind === 'configured' && dispatch.automations).toHaveLength(1);
  });

  it('falls back to the legacy hooks when nothing is declared and nothing is configured', () => {
    // The behaviour of every form in production today. If this ever changes, forms that have
    // never been republished lose their confirmation email, follow-up task, respondent-Person
    // upsert and answer scoring, silently and all at once.
    expect(resolveOnSubmitDispatch(input()).kind).toBe('legacy');
  });

  it('honours an explicit Legacy declaration', () => {
    expect(resolveOnSubmitDispatch(input('Legacy')).kind).toBe('legacy');
  });

  it('reports automations that a Legacy declaration makes unreachable', () => {
    // Mis-authored rather than meaningful, and invisible without this: the rows exist, the author
    // believes they run, and nothing errors. The builder cannot produce it; a hand-written
    // snapshot can.
    expect(hasUnreachableAutomations(input('Legacy', [automation()]))).toBe(true);
    expect(resolveOnSubmitDispatch(input('Legacy', [automation()])).kind).toBe('legacy');
  });

  it('reports nothing unreachable in the ordinary cases', () => {
    expect(hasUnreachableAutomations(input('Configured', [automation()]))).toBe(false);
    expect(hasUnreachableAutomations(input(undefined, [automation()]))).toBe(false);
    expect(hasUnreachableAutomations(input('Legacy'))).toBe(false);
  });
});
