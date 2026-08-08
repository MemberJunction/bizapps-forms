import { describe, expect, it } from 'vitest';
import {
  AUTHORED_AUTOMATION_FIELDS,
  buildPublishedAutomations,
  type AuthoredAutomationRow,
} from './published-automation-builder';

function row(overrides: Partial<AuthoredAutomationRow> = {}): AuthoredAutomationRow {
  return {
    ID: 'auto-1',
    Name: 'Upsert Person',
    TargetType: 'Action',
    ActionID: 'action-1',
    AgentID: null,
    BindingID: null,
    Trigger: 'OnComplete',
    ExecutionMode: 'Sync',
    DisplayOrder: 1,
    ConditionalRule: null,
    ContinueOnError: true,
    IsActive: true,
    ...overrides,
  };
}

describe('buildPublishedAutomations', () => {
  it('sorts by DisplayOrder so the snapshot order does not depend on the query', () => {
    const built = buildPublishedAutomations([
      row({ ID: 'third', DisplayOrder: 30 }),
      row({ ID: 'first', DisplayOrder: 10 }),
      row({ ID: 'second', DisplayOrder: 20 }),
    ]);

    expect(built.map((a) => a.id)).toEqual(['first', 'second', 'third']);
  });

  it('emits only the target id that matches the target type', () => {
    const [action] = buildPublishedAutomations([row({ TargetType: 'Action', ActionID: 'act-1' })]);
    const [binding] = buildPublishedAutomations([
      row({ TargetType: 'EntityBinding', ActionID: null, BindingID: 'bind-1' }),
    ]);

    expect(action.actionId).toBe('act-1');
    // Not `null`: the contract types these as optional, and serializing a null would publish a
    // field the parser is entitled to treat as absent.
    expect(action.bindingId).toBeUndefined();
    expect(binding.bindingId).toBe('bind-1');
    expect(binding.actionId).toBeUndefined();
  });

  it('carries an inactive automation rather than dropping it', () => {
    // Dropping it would make "disabled" indistinguishable from "never configured" to anyone
    // reading the snapshot. The runner is what honours `isActive`.
    const [built] = buildPublishedAutomations([row({ IsActive: false })]);

    expect(built.isActive).toBe(false);
  });

  it('parses a conditional rule so the runner can evaluate it from the snapshot', () => {
    const [built] = buildPublishedAutomations([
      row({ ConditionalRule: '{"show":{"all":[{"questionId":"q1","op":"equals","value":"Yes"}]}}' }),
    ]);

    expect(built.conditionalRule?.show?.all?.[0].value).toBe('Yes');
  });

  it('omits a conditional rule that does not parse, so the automation always fires', () => {
    // Absent means "always fires", which matches the contract. Publishing a half-understood rule
    // would gate a side effect on a condition nobody authored.
    const [built] = buildPublishedAutomations([row({ ConditionalRule: 'not json' })]);

    expect(built.conditionalRule).toBeUndefined();
  });

  it('produces JSON-serializable output, since this is written to a snapshot column', () => {
    const built = buildPublishedAutomations([row({})]);

    expect(JSON.parse(JSON.stringify(built))).toEqual(built);
  });

  it('asks for every column the mapper reads', () => {
    // A `simple` RunView returns only the fields it was asked for, so a column missing from this
    // list arrives as `undefined` and is published as a silently wrong value. Keeping the list and
    // the row type in lockstep is the whole point of exporting both.
    const mapped = Object.keys(row({}));

    expect([...AUTHORED_AUTOMATION_FIELDS].sort()).toEqual(mapped.sort());
  });
});
