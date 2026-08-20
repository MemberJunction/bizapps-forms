import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  definitionFingerprint,
  storedSnapshotFingerprint,
  publishControlState,
} from './publish-fingerprint';

/** A minimal snapshot shaped like `buildPublishedDefinition` output. */
function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formId: 'f1',
    formVersionId: 'v-original',
    name: 'Contact us',
    renderMode: 'Scroll',
    settings: {},
    styleTokens: { cssVariables: {}, customCSS: null, logoUrl: null },
    pages: [
      {
        id: 'p1',
        displayOrder: 0,
        questions: [
          { id: 'q1', type: 'ShortText', prompt: 'First name', isRequired: true, displayOrder: 0, options: [] },
        ],
      },
    ],
    automations: [],
    ...overrides,
  };
}

describe('definitionFingerprint', () => {
  it('sees an automation-only edit', () => {
    // Automations are publishable content: `fireHooksSafely` dispatches from the SNAPSHOT's
    // `automations` array, so an automation the author added but could never publish never runs.
    // While this key was ignored, adding one left the header on a static "Published" badge with
    // no publish control at all.
    const before = definitionFingerprint(snapshot());
    const after = definitionFingerprint(
      snapshot({
        automations: [
          { id: 'a1', name: 'Send confirmation', targetType: 'Action', trigger: 'OnComplete', executionMode: 'Sync', displayOrder: 1, continueOnError: true, isActive: true },
        ],
      }),
    );

    expect(after).not.toBe(before);
  });

  it('sees an automation being turned off', () => {
    const active = { id: 'a1', name: 'Send confirmation', targetType: 'Action', trigger: 'OnComplete', executionMode: 'Sync', displayOrder: 1, continueOnError: true, isActive: true };
    const on = definitionFingerprint(snapshot({ automations: [active] }));
    const off = definitionFingerprint(snapshot({ automations: [{ ...active, isActive: false }] }));

    expect(off).not.toBe(on);
  });

  it('reports no difference for an unchanged draft', () => {
    expect(definitionFingerprint(snapshot())).toBe(definitionFingerprint(snapshot()));
  });

  it('returns to the original fingerprint when an edit is undone', () => {
    // The whole point. The latch this replaced could not do it: add a question, remove it
    // again, and the form still claimed unpublished changes it did not have.
    const before = definitionFingerprint(snapshot());

    const edited = snapshot();
    (edited.pages as Record<string, unknown>[])[0].questions = [
      ...((edited.pages as Record<string, unknown>[])[0].questions as unknown[]),
      { id: 'q2', type: 'Email', prompt: 'Email', isRequired: false, displayOrder: 1, options: [] },
    ];
    expect(definitionFingerprint(edited)).not.toBe(before);

    const reverted = snapshot();
    expect(definitionFingerprint(reverted)).toBe(before);
  });

  it('ignores formVersionId, which is a fresh GUID on every publish', () => {
    expect(definitionFingerprint(snapshot({ formVersionId: 'v-2' }))).toBe(
      definitionFingerprint(snapshot({ formVersionId: 'v-3' })),
    );
  });

  it('notices a renamed form', () => {
    expect(definitionFingerprint(snapshot({ name: 'Contact us v2' }))).not.toBe(
      definitionFingerprint(snapshot()),
    );
  });

  it('notices an edited prompt', () => {
    const edited = snapshot();
    ((edited.pages as Record<string, unknown>[])[0].questions as Record<string, unknown>[])[0].prompt =
      'Given name';
    expect(definitionFingerprint(edited)).not.toBe(definitionFingerprint(snapshot()));
  });

  it('notices a reordering, because question order is what a respondent sees', () => {
    const two = snapshot();
    (two.pages as Record<string, unknown>[])[0].questions = [
      { id: 'q1', type: 'ShortText', prompt: 'A', isRequired: false, displayOrder: 0, options: [] },
      { id: 'q2', type: 'ShortText', prompt: 'B', isRequired: false, displayOrder: 1, options: [] },
    ];
    const swapped = snapshot();
    (swapped.pages as Record<string, unknown>[])[0].questions = [
      { id: 'q2', type: 'ShortText', prompt: 'B', isRequired: false, displayOrder: 0, options: [] },
      { id: 'q1', type: 'ShortText', prompt: 'A', isRequired: false, displayOrder: 1, options: [] },
    ];
    expect(definitionFingerprint(two)).not.toBe(definitionFingerprint(swapped));
  });

  it('is unmoved by key order, which is the difference between built and stored JSON', () => {
    // The built snapshot has the key order buildPublishedDefinition emits; the stored one
    // has whatever order it was serialized in. Without canonicalization every form would
    // read as permanently dirty.
    const a = { formId: 'f1', name: 'X', pages: [{ id: 'p', displayOrder: 0 }] };
    const b = { pages: [{ displayOrder: 0, id: 'p' }], name: 'X', formId: 'f1' };
    expect(definitionFingerprint(a)).toBe(definitionFingerprint(b));
  });

  it('treats an explicitly-undefined optional field the same as an absent one', () => {
    // JSON.stringify drops `description: undefined` on the built side; the parsed side
    // simply has no such key. Those must not read as a change.
    expect(definitionFingerprint({ name: 'X', description: undefined })).toBe(
      definitionFingerprint({ name: 'X' }),
    );
  });
});

describe('canonicalJson', () => {
  it('sorts object keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('storedSnapshotFingerprint', () => {
  it('returns null when nothing has ever been published', () => {
    expect(storedSnapshotFingerprint(null)).toBeNull();
    expect(storedSnapshotFingerprint('')).toBeNull();
  });

  it('matches the fingerprint of the same snapshot built in memory', () => {
    const stored = JSON.stringify(snapshot({ formVersionId: 'v-stored' }));
    expect(storedSnapshotFingerprint(stored)).toBe(
      definitionFingerprint(snapshot({ formVersionId: 'v-live' })),
    );
  });

  it('returns null for unparseable stored JSON rather than throwing', () => {
    // No baseline means the builder offers Publish — republishing something already live
    // is recoverable; hiding real changes from respondents is not.
    expect(storedSnapshotFingerprint('{not json')).toBeNull();
  });
});

describe('publishControlState', () => {
  it('offers Publish when there is no baseline, even on a form marked Published', () => {
    // THE DEFECT. A Published form whose FormVersion read failed (or whose snapshot would not
    // parse) has no baseline, so `dirty` is false for lack of evidence. The old rule then read
    // the status and returned 'current' — a static "Published" badge with no button. The author
    // edits ten questions, the header assures them everything is live, and there is no control
    // that would make it so. `storedSnapshotFingerprint` says the safe direction is to offer
    // Publish; this is where that has to actually happen.
    expect(publishControlState({ dirty: false, hasPublishedBaseline: false, status: 'Published' })).toBe(
      'publish',
    );
  });

  it('still says current for a published form that genuinely matches its baseline', () => {
    expect(publishControlState({ dirty: false, hasPublishedBaseline: true, status: 'Published' })).toBe(
      'current',
    );
  });

  it('offers Publish for a draft that has never been published', () => {
    expect(publishControlState({ dirty: false, hasPublishedBaseline: false, status: 'Draft' })).toBe(
      'publish',
    );
  });

  it('offers Update whenever the draft differs, whatever the status says', () => {
    expect(publishControlState({ dirty: true, hasPublishedBaseline: true, status: 'Published' })).toBe(
      'update',
    );
    expect(publishControlState({ dirty: true, hasPublishedBaseline: true, status: 'Draft' })).toBe(
      'update',
    );
  });
});
