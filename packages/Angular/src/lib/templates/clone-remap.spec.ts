import { describe, it, expect } from 'vitest';
import { remapConditionalRule, remapFieldMappings } from './clone-remap';

const MAP = new Map([
  ['q-old-1', 'q-new-1'],
  ['q-old-2', 'q-new-2'],
]);

describe('remapConditionalRule', () => {
  it('rewrites every question id a rule references', () => {
    const rule = JSON.stringify({
      show: { all: [{ questionId: 'q-old-1', op: 'equals', value: 'yes' }] },
    });
    const result = remapConditionalRule(rule, MAP);
    expect(result.json).not.toBeNull();
    expect(JSON.parse(result.json as string)).toEqual({
      show: { all: [{ questionId: 'q-new-1', op: 'equals', value: 'yes' }] },
    });
    expect(result.dropped).toBe(0);
  });
});

describe('remapConditionalRule — absent rules', () => {
  it('leaves a form without rules alone rather than inventing an empty one', () => {
    expect(remapConditionalRule(null, MAP)).toEqual({ json: null, dropped: 0 });
    expect(remapConditionalRule('   ', MAP)).toEqual({ json: null, dropped: 0 });
  });
});

describe('remapConditionalRule — unmappable references', () => {
  it('drops a condition whose question has no counterpart, rather than leaving it dangling', () => {
    const rule = JSON.stringify({
      show: {
        all: [
          { questionId: 'q-old-1', op: 'equals', value: 'yes' },
          { questionId: 'q-gone', op: 'isAnswered' },
        ],
      },
    });
    const result = remapConditionalRule(rule, MAP);
    expect(JSON.parse(result.json as string)).toEqual({
      show: { all: [{ questionId: 'q-new-1', op: 'equals', value: 'yes' }] },
    });
    expect(result.dropped).toBe(1);
  });

  it('drops the whole rule when nothing survives, so the question stays visible', () => {
    const rule = JSON.stringify({ show: { all: [{ questionId: 'q-gone', op: 'isAnswered' }] } });
    expect(remapConditionalRule(rule, MAP)).toEqual({ json: null, dropped: 1 });
  });
});

describe('remapConditionalRule — malformed input', () => {
  it('drops an unparseable rule and says so, instead of throwing away the whole clone', () => {
    const result = remapConditionalRule('{not json', MAP);
    expect(result.json).toBeNull();
    expect(result.dropped).toBe(1);
    expect(result.error).toContain('could not be parsed');
  });

  it('reports a rule that is valid JSON but the wrong shape', () => {
    const result = remapConditionalRule('[1,2,3]', MAP);
    expect(result.json).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe('remapFieldMappings', () => {
  const mappings = (fields: unknown[]) => JSON.stringify({ version: 1, fields });

  it('rewrites question-sourced mappings and leaves static ones untouched', () => {
    const raw = mappings([
      { targetField: 'Email', source: { kind: 'question', questionId: 'q-old-2' }, required: true },
      { targetField: 'Source', source: { kind: 'static', value: 'web' } },
    ]);
    const result = remapFieldMappings(raw, MAP);
    expect(JSON.parse(result.json as string)).toEqual({
      version: 1,
      fields: [
        { targetField: 'Email', source: { kind: 'question', questionId: 'q-new-2' }, required: true },
        { targetField: 'Source', source: { kind: 'static', value: 'web' } },
      ],
    });
    expect(result.dropped).toBe(0);
  });

  it('drops a mapping whose question is gone rather than writing a blank into a real record', () => {
    const raw = mappings([
      { targetField: 'Email', source: { kind: 'question', questionId: 'q-gone' } },
      { targetField: 'Source', source: { kind: 'static', value: 'web' } },
    ]);
    const result = remapFieldMappings(raw, MAP);
    expect(JSON.parse(result.json as string).fields).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it('reports unparseable mappings instead of copying them verbatim', () => {
    const result = remapFieldMappings('{oops', MAP);
    expect(result.json).toBeNull();
    expect(result.error).toContain('could not be parsed');
  });

  it('treats an absent mapping as absent', () => {
    expect(remapFieldMappings(null, MAP)).toEqual({ json: null, dropped: 0 });
  });
});

describe('remapConditionalRule — emptied arms', () => {
  it('removes an arm that lost every condition instead of leaving a puzzling empty one', () => {
    const rule = JSON.stringify({
      show: {
        all: [{ questionId: 'q-old-1', op: 'equals', value: 'yes' }],
        any: [{ questionId: 'q-gone', op: 'isAnswered' }],
      },
    });
    const result = remapConditionalRule(rule, MAP);
    expect(JSON.parse(result.json as string)).toEqual({
      show: { all: [{ questionId: 'q-new-1', op: 'equals', value: 'yes' }] },
    });
    expect(result.dropped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// RULES_AND_BRANCHING_PLAN Phase C — the new verbs survive a clone.
// ---------------------------------------------------------------------------

describe('remapConditionalRule — the jump verb (C2)', () => {
  const PAGE_MAP = new Map([['p-old-3', 'p-new-3']]);

  it('happy: remaps a jump — both its when-group and its target page id', () => {
    const rule = JSON.stringify({
      jump: [{ when: { all: [{ questionId: 'q-old-1', op: 'equals', value: 'skip' }] }, target: { kind: 'page', id: 'p-old-3' } }],
    });
    const result = remapConditionalRule(rule, MAP, PAGE_MAP);
    expect(JSON.parse(result.json as string)).toEqual({
      jump: [{ when: { all: [{ questionId: 'q-new-1', op: 'equals', value: 'skip' }] }, target: { kind: 'page', id: 'p-new-3' } }],
    });
  });

  it('edge: a score condition copies verbatim — the running total is form-relative', () => {
    const rule = JSON.stringify({
      show: { all: [{ source: 'score', op: 'greaterThan', value: 70 }] },
    });
    const result = remapConditionalRule(rule, MAP, PAGE_MAP);
    expect(JSON.parse(result.json as string)).toEqual({
      show: { all: [{ source: 'score', op: 'greaterThan', value: 70 }] },
    });
    expect(result.dropped).toBe(0);
  });

  it('worst: a jump with no page map (or an unmappable target) is dropped and counted, never dangling', () => {
    const rule = JSON.stringify({
      jump: [{ when: { all: [{ questionId: 'q-old-1', op: 'isAnswered' }] }, target: { kind: 'page', id: 'p-old-3' } }],
    });
    expect(remapConditionalRule(rule, MAP)).toEqual({ json: null, dropped: 1 });
    expect(remapConditionalRule(rule, MAP, new Map())).toEqual({ json: null, dropped: 1 });
  });

  it('worst: a question condition with no questionId is dropped, not resurrected', () => {
    const rule = JSON.stringify({ show: { all: [{ op: 'isAnswered' }] } });
    expect(remapConditionalRule(rule, MAP, PAGE_MAP)).toEqual({ json: null, dropped: 1 });
  });
  it('edge: an UNCONDITIONAL jump survives the clone', () => {
    // An empty `when` is vacuously true, so this jump always fires — `resolveVisiblePages` skips
    // the pages between, which is a coherent thing to author and reachable from mj-sync metadata
    // and the AI builder even though the editor cannot produce it. `remapGroup` returns
    // `undefined` for a group with nothing in it AND for a group whose every condition failed to
    // remap, and the jump loop read both as failure — so cloning silently dropped the rule and
    // the copy asked a page the original skipped, reported as "a reference to a question that was
    // not copied", which names nothing that happened here.
    const rule = JSON.stringify({ jump: [{ when: {}, target: { kind: 'page', id: 'p-old-3' } }] });
    const result = remapConditionalRule(rule, MAP, PAGE_MAP);
    expect(result.dropped).toBe(0);
    expect(JSON.parse(result.json as string)).toEqual({ jump: [{ when: {}, target: { kind: 'page', id: 'p-new-3' } }] });
  });

  it('worst: a jump whose conditions ALL fail to remap is still dropped', () => {
    // The distinction the fix turns on: "was empty" is not "became empty". Two drops are counted
    // because two things were genuinely lost — the dead condition, and the rule that can no
    // longer be built from it.
    const rule = JSON.stringify({
      jump: [{ when: { all: [{ questionId: 'q-not-copied', op: 'isAnswered' }] }, target: { kind: 'page', id: 'p-old-3' } }],
    });
    expect(remapConditionalRule(rule, MAP, PAGE_MAP)).toEqual({ json: null, dropped: 2 });
  });
  it('edge: a legacy require key is dropped by the clone, not carried into the copy', () => {
    // The require verb is gone (RULES_SIMPLIFICATION_PLAN Phase 1), but a source form authored
    // before that still carries the key. The copy must not inherit it — a key nothing evaluates
    // is a rule a future reader would believe. Not counted as a drop: nothing was LOST, because
    // the key no longer means anything on either side of the clone.
    const rule = JSON.stringify({ require: { all: [{ questionId: 'q-old-1', op: 'isAnswered' }] } });
    expect(remapConditionalRule(rule, MAP, PAGE_MAP)).toEqual({ json: null, dropped: 0 });
  });

  it('worst: a legacy require key does not take the show rule down with it', () => {
    const rule = JSON.stringify({
      show: { all: [{ questionId: 'q-old-1', op: 'equals', value: 'Yes' }] },
      require: { all: [{ questionId: 'q-old-1', op: 'isAnswered' }] },
    });
    const result = remapConditionalRule(rule, MAP, PAGE_MAP);
    expect(result.dropped).toBe(0);
    expect(JSON.parse(result.json as string)).toEqual({
      show: { all: [{ questionId: 'q-new-1', op: 'equals', value: 'Yes' }] },
    });
  });

  it('edge: an empty SHOW group is still collapsed, and that asymmetry is deliberate', () => {
    // `show: {}` is vacuously true too, but for visibility that means "always visible" — which is
    // exactly what having no rule means. Collapsing it loses nothing, where collapsing an empty
    // `jump` changes what the form does.
    expect(remapConditionalRule(JSON.stringify({ show: {} }), MAP, PAGE_MAP)).toEqual({ json: null, dropped: 0 });
  });
});
