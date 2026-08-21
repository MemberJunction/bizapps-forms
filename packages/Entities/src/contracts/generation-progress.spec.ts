import { describe, it, expect } from 'vitest';
import {
  foldProgress,
  isGenerateFormProgressEvent,
  parseGenerationProgress,
  type GenerateFormProgressEvent,
  type GenerationProgress,
} from './generation-progress';

const event = (over: Partial<GenerateFormProgressEvent> = {}): GenerateFormProgressEvent => ({
  resolver: 'FormsGenerate',
  type: 'GenerateFormProgress',
  formId: 'form-1',
  stage: 'page',
  step: 2,
  total: 4,
  label: 'Filled in Travel',
  ...over,
});

describe('parseGenerationProgress', () => {
  it('accepts one of ours', () => {
    expect(parseGenerationProgress(JSON.stringify(event()))?.step).toBe(2);
  });

  it('rejects another resolver publishing on the same channel', () => {
    // `statusUpdates` is shared with every other resolver on the server. Filtering on one
    // discriminator would make this client act on somebody else's messages.
    const foreign = { ...event(), resolver: 'VersionHistoryResolver' };
    expect(parseGenerationProgress(JSON.stringify(foreign))).toBeUndefined();
  });

  it('rejects the same resolver publishing a different message type', () => {
    expect(parseGenerationProgress(JSON.stringify({ ...event(), type: 'SomethingElse' }))).toBeUndefined();
  });

  it('treats non-JSON as "not ours" rather than as an error', () => {
    // Plain-string status messages ride this channel. A throw here would turn every one of them
    // into a console error in a builder that is working perfectly.
    expect(parseGenerationProgress('Saving your changes…')).toBeUndefined();
    expect(parseGenerationProgress('')).toBeUndefined();
  });

  it('rejects a message missing a field the progress bar reads', () => {
    // Better to drop it than to render NaN%.
    for (const missing of ['formId', 'step', 'total', 'label', 'stage'] as const) {
      const partial: Record<string, unknown> = { ...event() };
      delete partial[missing];
      expect(isGenerateFormProgressEvent(partial), missing).toBe(false);
    }
  });

  it('rejects a zero total, which would divide by zero', () => {
    expect(isGenerateFormProgressEvent({ ...event(), total: 0 })).toBe(false);
  });
});

describe('foldProgress', () => {
  it('turns step and total into a percentage', () => {
    expect(foldProgress(undefined, event({ step: 1, total: 4 })).percent).toBe(25);
    expect(foldProgress(undefined, event({ step: 3, total: 4 })).percent).toBe(75);
  });

  it('never moves the bar backwards when events arrive out of order', () => {
    // Page details run concurrently, so page 3 can land before page 2 — and a websocket promises
    // no ordering regardless. A bar that jumps back reads as a bug to whoever is watching it.
    const after3 = foldProgress(undefined, event({ step: 3, total: 4, label: 'Filled in Extras' }));
    const after2 = foldProgress(after3, event({ step: 2, total: 4, label: 'Filled in Travel' }));
    expect(after2.percent).toBe(75);
  });

  it('still takes the newer label when the bar does not move', () => {
    // A stale label under a correct bar is the more confusing of the two pairings: the label names
    // work that genuinely just happened.
    const after3 = foldProgress(undefined, event({ step: 3, total: 4, label: 'Filled in Extras' }));
    const after2 = foldProgress(after3, event({ step: 2, total: 4, label: 'Filled in Travel' }));
    expect(after2.label).toBe('Filled in Travel');
  });

  it('pins to 100 and finishes on complete', () => {
    const done = foldProgress(undefined, event({ stage: 'complete', step: 4, total: 4, label: 'Ready' }));
    expect(done.percent).toBe(100);
    expect(done.finished).toBe(true);
  });

  it('carries the degraded list off the terminal event', () => {
    const done = foldProgress(undefined, event({ stage: 'complete', step: 4, total: 4, degraded: ['page:2'] }));
    expect(done.degraded).toEqual(['page:2']);
  });

  it('reports a clean run as no degradation', () => {
    expect(foldProgress(undefined, event({ stage: 'complete', step: 4, total: 4 })).degraded).toEqual([]);
  });

  it('cannot be un-finished by a straggler arriving after completion', () => {
    const done = foldProgress(undefined, event({ stage: 'complete', step: 4, total: 4, degraded: ['page:2'] }));
    const after = foldProgress(done, event({ step: 3, total: 4, label: 'Filled in Extras' }));
    expect(after.finished).toBe(true);
    expect(after.percent).toBe(100);
    expect(after.degraded).toEqual(['page:2']);
  });

  it('clamps a nonsensical step rather than rendering past 100%', () => {
    expect(foldProgress(undefined, event({ step: 99, total: 4 })).percent).toBe(100);
    expect(foldProgress(undefined, event({ step: -5, total: 4 })).percent).toBe(0);
  });

  it('keeps the form id so the builder knows which draft it is watching', () => {
    const state: GenerationProgress = foldProgress(undefined, event({ formId: 'form-9' }));
    expect(state.formId).toBe('form-9');
  });
});
