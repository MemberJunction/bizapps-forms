import { describe, expect, it } from 'vitest';
import {
  AUTHORED_AUTOMATION_FIELDS,
  AUTHORED_BINDING_FIELDS,
  buildPublishedAutomations,
  tryBuildPublishedAutomations,
  type AuthoredAutomationRow,
  type AuthoredBindingRow,
  MissingBindingError,
} from './published-automation-builder';
import { UnreadableColumnError } from './snapshot-builder';

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

function bindingRow(overrides: Partial<AuthoredBindingRow> = {}): AuthoredBindingRow {
  return {
    ID: 'bind-1',
    Name: 'Applicant record',
    TargetEntityName: 'MJ_BizApps_Common: People',
    FieldMappings: JSON.stringify({ version: 1, fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } }] }),
    IdentityRule: JSON.stringify({ mode: 'MatchThenCreate', match: [{ targetField: 'Email', normalize: 'LowerCaseTrim' }] }),
    MergePolicy: JSON.stringify({ default: 'writeOnce' }),
    Status: 'Active',
    ...overrides,
  };
}

const bindingAutomation = (overrides: Partial<AuthoredAutomationRow> = {}): AuthoredAutomationRow =>
  row({ TargetType: 'EntityBinding', ActionID: null, BindingID: 'bind-1', ...overrides });

describe('buildPublishedAutomations', () => {
  it('sorts by DisplayOrder so the snapshot order does not depend on the query', () => {
    const built = buildPublishedAutomations([
      row({ ID: 'third', DisplayOrder: 30 }),
      row({ ID: 'first', DisplayOrder: 10 }),
      row({ ID: 'second', DisplayOrder: 20 }),
    ], []);

    expect(built.map((a) => a.id)).toEqual(['first', 'second', 'third']);
  });

  it('emits only the target id that matches the target type', () => {
    const [action] = buildPublishedAutomations([row({ TargetType: 'Action', ActionID: 'act-1' })], []);
    const [binding] = buildPublishedAutomations([bindingAutomation()], [bindingRow()]);

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
    const [built] = buildPublishedAutomations([row({ IsActive: false })], []);

    expect(built.isActive).toBe(false);
  });

  it('parses a conditional rule so the runner can evaluate it from the snapshot', () => {
    const [built] = buildPublishedAutomations([
      row({ ConditionalRule: '{"show":{"all":[{"questionId":"q1","op":"equals","value":"Yes"}]}}' }),
    ], []);

    expect(built.conditionalRule?.show?.all?.[0].value).toBe('Yes');
  });

  it('refuses a conditional rule it cannot read, naming the automation (#303 DW6)', () => {
    // It used to be dropped, so the automation published with no rule and fired on EVERY response:
    // a side effect gated on a condition the author wrote, running unconditionally. A rule the
    // schema rejects now refuses the publish, the same way an unreadable question rule does.
    const build = () => buildPublishedAutomations([row({ Name: 'Notify sales', ConditionalRule: 'not json' })], []);

    expect(build).toThrow(UnreadableColumnError);
    expect(build).toThrow(/automation "Notify sales" \(auto-1\) ConditionalRule/);
  });

  it('refuses a conditional rule that is JSON but not a rule', () => {
    const build = () =>
      buildPublishedAutomations([row({ ConditionalRule: '{"show":{"all":[{"op":"equals"}]}}' })], []);

    expect(build).toThrow(UnreadableColumnError);
  });

  it('produces JSON-serializable output, since this is written to a snapshot column', () => {
    const built = buildPublishedAutomations([row({}), bindingAutomation({ ID: 'auto-2' })], [bindingRow()]);

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

describe('buildPublishedAutomations — the binding block (#303)', () => {
  it('freezes the binding settings into an EntityBinding automation, parsed', () => {
    const [built] = buildPublishedAutomations([bindingAutomation()], [bindingRow()]);

    expect(built.binding).toEqual({
      targetEntityName: 'MJ_BizApps_Common: People',
      fieldMappings: {
        version: 1,
        fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q-email' }, required: false }],
      },
      identityRule: {
        mode: 'MatchThenCreate',
        match: [{ targetField: 'Email', normalize: 'LowerCaseTrim' }],
        scope: [],
        onMultipleMatch: 'Oldest',
        onMissingIdentityValue: 'Skip',
      },
      mergePolicy: { default: 'writeOnce', fields: {} },
      status: 'Active',
    });
  });

  it('carries a Disabled binding with its status, rather than dropping it', () => {
    const [built] = buildPublishedAutomations([bindingAutomation()], [bindingRow({ Status: 'Disabled' })]);

    expect(built.binding?.status).toBe('Disabled');
  });

  it('reads an absent merge policy as the documented default', () => {
    const [built] = buildPublishedAutomations([bindingAutomation()], [bindingRow({ MergePolicy: null })]);

    expect(built.binding?.mergePolicy).toEqual({ default: 'neverBlank', fields: {} });
  });

  it('gives an Action or Agent automation no binding block, even when bindings are supplied', () => {
    const [built] = buildPublishedAutomations([row({})], [bindingRow()]);

    expect('binding' in built).toBe(false);
  });

  it('refuses an automation whose binding row is missing, saying it is MISSING and what to do', () => {
    const build = () => buildPublishedAutomations([bindingAutomation({ Name: 'Write applicant' })], []);

    expect(build).toThrow(MissingBindingError);
    expect(build).toThrow(
      'Cannot publish: automation "Write applicant" (auto-1) runs binding bind-1, which no longer exists. ' +
        'Remove the step or link it to an existing binding.',
    );
  });

  it('refuses an entity-binding step that names no binding at all', () => {
    const build = () => buildPublishedAutomations([bindingAutomation({ BindingID: null })], []);

    expect(build).toThrow(MissingBindingError);
    expect(build).toThrow(/automation "Upsert Person" \(auto-1\) is an entity-binding step with no binding/);
  });

  it.each([
    ['FieldMappings', { FieldMappings: '{"version":1,"fields":[{"targetField":"Email"}]}' }],
    ['IdentityRule', { IdentityRule: '{"mode":"Sometimes"}' }],
    ['MergePolicy', { MergePolicy: '{"default":"neverBank"}' }],
    ['FieldMappings', { FieldMappings: 'not json' }],
  ] as const)('refuses binding settings it cannot read, naming the binding, the column AND the step (%s)', (column, overrides) => {
    const build = () => buildPublishedAutomations([bindingAutomation({ Name: 'Write applicant' })], [bindingRow(overrides)]);

    expect(build).toThrow(UnreadableColumnError);
    expect(build).toThrow(
      new RegExp(`binding "Applicant record" \\(bind-1\\) ${column} of automation "Write applicant" \\(auto-1\\) cannot be read`),
    );
  });

  it('asks for every binding column the mapper reads', () => {
    expect([...AUTHORED_BINDING_FIELDS].sort()).toEqual(Object.keys(bindingRow()).sort());
  });
});

describe('tryBuildPublishedAutomations', () => {
  it('returns the automations when everything reads', () => {
    const built = tryBuildPublishedAutomations([bindingAutomation()], [bindingRow()]);
    expect(built.ok && built.automations.map((a) => a.binding?.targetEntityName)).toEqual(['MJ_BizApps_Common: People']);
  });

  it('returns an unreadable column as a result instead of throwing', () => {
    const built = tryBuildPublishedAutomations([row({ ConditionalRule: '{oops' })], []);
    expect(built.ok).toBe(false);
    expect(!built.ok && built.error).toBeInstanceOf(UnreadableColumnError);
  });

  it('returns a missing binding as a result instead of throwing', () => {
    const built = tryBuildPublishedAutomations([bindingAutomation()], []);
    expect(built.ok).toBe(false);
    expect(!built.ok && built.error).toBeInstanceOf(MissingBindingError);
  });
});

/**
 * An INACTIVE step does not block publish over a rule or binding it could never use (#303 decision).
 *
 * `isActive` is frozen into the snapshot: an inactive step cannot run in the version being
 * published, and re-enabling it needs another publish — which is strict, because the step is active
 * by then. Blocking now would refuse a form over configuration no respondent of this version can
 * reach. The step is still carried (as inactive), with the unreadable part omitted.
 */
describe('buildPublishedAutomations — inactive steps', () => {
  it('publishes an inactive step with an unreadable rule, without the rule', () => {
    const [built] = buildPublishedAutomations([row({ IsActive: false, ConditionalRule: 'not json' })], []);

    expect(built.isActive).toBe(false);
    expect('conditionalRule' in built).toBe(false);
  });

  it('publishes an inactive binding step whose binding is missing or unreadable, without the block', () => {
    const [missing] = buildPublishedAutomations([bindingAutomation({ IsActive: false })], []);
    const [unreadable] = buildPublishedAutomations(
      [bindingAutomation({ IsActive: false })],
      [bindingRow({ IdentityRule: '{"mode":"Sometimes"}' })],
    );

    expect('binding' in missing).toBe(false);
    expect('binding' in unreadable).toBe(false);
    expect(unreadable.bindingId).toBe('bind-1');
  });

  it('still freezes a readable rule and binding on an inactive step', () => {
    const [built] = buildPublishedAutomations(
      [bindingAutomation({ IsActive: false, ConditionalRule: '{"show":{"all":[{"questionId":"q1","op":"equals","value":"Yes"}]}}' })],
      [bindingRow()],
    );

    expect(built.conditionalRule).toBeDefined();
    expect(built.binding?.targetEntityName).toBe('MJ_BizApps_Common: People');
  });

  it('still refuses a Disabled binding on an ACTIVE step — the binding Status is a live switch, not the step\'s', () => {
    expect(() =>
      buildPublishedAutomations([bindingAutomation()], [bindingRow({ Status: 'Disabled', IdentityRule: '{"mode":"Sometimes"}' })]),
    ).toThrow(UnreadableColumnError);
  });
});
