/**
 * Builder → parser round trip (#303).
 *
 * The snapshot builder (`buildPublishedDefinition`, in the contracts) writes `DefinitionSnapshot`;
 * the server's parser (`parsePublishedDefinition`) reads it back on every public load. They are two
 * whitelists, and a field one side emits and the other does not name is silently lost — or, for a
 * rule, silently DROPPED by the parser, which for a show rule makes the guarded item visible to
 * everyone. This drives a draft that exercises every field the builder writes through both, and
 * requires the parser to hand back exactly what the builder built.
 *
 * The other half of the contract — a rule the parser would drop is never published in the first
 * place — is `snapshot-builder.spec.ts` in the contracts (the builder refuses it, naming the item).
 */
import { describe, expect, it } from 'vitest';
import {
  buildPublishedAutomations,
  buildPublishedDefinition,
  type AuthoredFormTree,
  type AuthoredOptionRow,
  type AuthoredQuestionRow,
  type AuthoredScreenRow,
} from '@mj-biz-apps/forms-entities';
import { parsePublishedDefinition } from '../snapshot-parser.js';

function questionRow(overrides: Partial<AuthoredQuestionRow> & { ID: string }): AuthoredQuestionRow {
  return {
    QuestionType: 'ShortText',
    Prompt: overrides.ID,
    HelpText: null,
    IsRequired: false,
    DisplayOrder: 0,
    ConditionalRule: null,
    ValidationRule: null,
    ScoringConfig: null,
    Settings: null,
    ...overrides,
  };
}

function optionRow(overrides: Partial<AuthoredOptionRow> & { ID: string; Label: string }): AuthoredOptionRow {
  return { Value: null, DisplayOrder: 0, IsDefault: false, ImageURL: null, MatrixAxis: null, ...overrides };
}

function screenRow(overrides: Partial<AuthoredScreenRow> & { ID: string }): AuthoredScreenRow {
  return {
    ScreenType: 'Ending',
    Title: overrides.ID,
    Body: null,
    ButtonLabel: null,
    MediaURL: null,
    RedirectURL: null,
    DisplayOrder: 0,
    ConditionalRule: null,
    IsDefault: false,
    IsDisqualification: false,
    SocialLinks: null,
    ...overrides,
  };
}

/** A draft touching every field the snapshot builder writes. */
function everyFieldDraft(): AuthoredFormTree {
  return {
    form: {
      ID: 'form-1',
      Name: 'Everything',
      Description: 'A form with one of each',
      RenderMode: 'OneQuestion',
      Settings: JSON.stringify({
        anonymousAllowed: false,
        captchaRequired: true,
        quota: 50,
        opensAt: '2026-01-01T00:00:00Z',
        closesAt: '2027-01-01T00:00:00Z',
        confirmationMessage: 'Thanks!',
        redirectUrl: 'https://example.com/after',
        onSubmitMode: 'Configured',
      }),
    },
    pages: [
      {
        entity: {
          ID: 'p1',
          Title: 'About you',
          Description: 'First things first',
          DisplayOrder: 3,
          IsPartialSubmitPoint: true,
          ConditionalRule: null,
        },
        questions: [
          {
            entity: questionRow({
              ID: 'q-age',
              QuestionType: 'Number',
              Prompt: 'Your age',
              HelpText: 'In years',
              IsRequired: true,
              DisplayOrder: 1,
              ValidationRule: JSON.stringify({ min: 0, max: 130 }),
              Settings: JSON.stringify({ placeholder: 'e.g. 30' }),
              ConditionalRule: JSON.stringify({
                jump: [
                  { when: { all: [{ questionId: 'q-age', op: 'lessThan', value: 18 }] }, target: { kind: 'ending', id: 'end-ko' } },
                  // The legacy page-only shape, still found in old rows: both sides normalise it.
                  { when: { all: [{ questionId: 'q-age', op: 'greaterThan', value: 99 }] }, toPageId: 'p2' },
                ],
              }),
            }),
            options: [],
          },
          {
            entity: questionRow({
              ID: 'q-colour',
              QuestionType: 'SingleChoice',
              Prompt: 'Colour',
              DisplayOrder: 2,
              ScoringConfig: JSON.stringify({ points: { red: 5, blue: 1 } }),
              ConditionalRule: JSON.stringify({ show: { any: [{ questionId: 'q-age', op: 'isAnswered' }] } }),
            }),
            options: [
              optionRow({ ID: 'o-blue', Label: 'Blue', Value: 'blue', DisplayOrder: 2 }),
              optionRow({ ID: 'o-red', Label: 'Red', DisplayOrder: 1, IsDefault: true }),
              optionRow({ ID: 'o-red-2', Label: 'Red', DisplayOrder: 3 }),
            ],
          },
        ],
      },
      {
        entity: {
          ID: 'p2',
          Title: null,
          Description: null,
          DisplayOrder: 7,
          IsPartialSubmitPoint: false,
          ConditionalRule: JSON.stringify({ show: { all: [{ questionId: 'q-colour', op: 'notEquals', value: 'blue' }] } }),
        },
        questions: [
          {
            entity: questionRow({ ID: 'q-pic', QuestionType: 'PictureChoice', Prompt: 'Pick one' }),
            options: [optionRow({ ID: 'o-cat', Label: 'Cat', ImageURL: 'http://localhost:4000/forms/asset/0b5f3c1e-8a2d-4c6f-9e1a-7d3b2c4e5f60' })],
          },
          {
            entity: questionRow({ ID: 'q-grid', QuestionType: 'Matrix', Prompt: 'Rate', DisplayOrder: 1 }),
            options: [
              optionRow({ ID: 'o-row', Label: 'Speed', MatrixAxis: 'Row' }),
              optionRow({ ID: 'o-col', Label: 'Good', MatrixAxis: 'Column', DisplayOrder: 1 }),
            ],
          },
        ],
      },
    ],
    screens: [
      screenRow({ ID: 'welcome', ScreenType: 'Welcome', Title: 'Hello', Body: 'Welcome', ButtonLabel: 'Start', MediaURL: '/forms/asset/hero' }),
      screenRow({
        ID: 'end-high',
        Title: 'High scorer',
        DisplayOrder: 1,
        ConditionalRule: JSON.stringify({ show: { all: [{ source: 'score', op: 'greaterThan', value: 4 }] } }),
        SocialLinks: JSON.stringify([{ platform: 'linkedin', url: 'https://linkedin.com/company/x' }]),
        RedirectURL: 'https://example.com/high',
      }),
      screenRow({ ID: 'end-ko', Title: 'Not eligible', DisplayOrder: 2, IsDisqualification: true }),
      screenRow({ ID: 'end-default', Title: 'Thanks', DisplayOrder: 3, IsDefault: true, Body: 'Done' }),
    ],
  };
}

describe('builder → parser round trip', () => {
  it('parses back exactly what the builder built, for every field the builder writes', () => {
    const automations = buildPublishedAutomations([
      {
        ID: 'a1',
        Name: 'Upsert',
        TargetType: 'Action',
        ActionID: 'act-1',
        AgentID: null,
        BindingID: null,
        Trigger: 'OnComplete',
        ExecutionMode: 'Sync',
        DisplayOrder: 1,
        ConditionalRule: JSON.stringify({ show: { all: [{ questionId: 'q-age', op: 'greaterThan', value: 17 }] } }),
        ContinueOnError: false,
        IsActive: true,
      },
      {
        ID: 'a2',
        Name: 'Write applicant',
        TargetType: 'EntityBinding',
        ActionID: null,
        AgentID: null,
        BindingID: 'bind-1',
        Trigger: 'OnComplete',
        ExecutionMode: 'Async',
        DisplayOrder: 2,
        ConditionalRule: null,
        ContinueOnError: true,
        IsActive: true,
      },
    ], [
      {
        ID: 'bind-1',
        Name: 'Applicant',
        TargetEntityName: 'MJ_BizApps_Common: People',
        FieldMappings: JSON.stringify({
          version: 1,
          fields: [
            { targetField: 'Email', source: { kind: 'question', questionId: 'q-age' }, required: true },
            { targetField: 'Source', source: { kind: 'static', value: 'web' } },
          ],
        }),
        IdentityRule: JSON.stringify({
          mode: 'MatchThenCreate',
          match: [{ targetField: 'Email', normalize: 'LowerCaseTrim' }],
          scope: [{ targetField: 'TenantID', value: 't-1' }],
          onMultipleMatch: 'Fail',
        }),
        MergePolicy: JSON.stringify({ default: 'latestWins', fields: { Email: 'writeOnce' } }),
        Status: 'Disabled',
      },
    ]);
    const built = buildPublishedDefinition(
      everyFieldDraft(),
      { CSSVariables: JSON.stringify({ '--mjf-accent': '#123456' }), CustomCSS: '.x{}', LogoURL: '/forms/asset/logo' },
      'version-1',
      automations,
    );

    const parsed = parsePublishedDefinition(JSON.stringify(built));

    expect(parsed).toEqual(built);
    // Spot-check the fields most likely to fall out of one whitelist and not the other.
    expect(parsed?.pages[0].questions[0].conditionalRule?.jump?.[1].target).toEqual({ kind: 'page', id: 'p2' });
    expect(parsed?.pages[0].questions[1].scoring).toEqual({ points: { red: 5, blue: 1 } });
    expect(parsed?.pages[0].questions[1].options.map((o) => o.value)).toEqual(['Red', 'blue', 'Red (2)']);
    expect(parsed?.endScreens.map((e) => e.id)).toEqual(['end-high', 'end-ko', 'end-default']);
    expect(parsed?.settings.onSubmitMode).toBe('Configured');
    expect(parsed?.automations[0].conditionalRule).toBeDefined();
    expect(parsed?.automations[1].binding?.mergePolicy.fields).toEqual({ email: 'writeOnce' });
  });

  it('round-trips the smallest draft too, where every optional field is absent', () => {
    const built = buildPublishedDefinition(
      { form: { ID: 'f', Name: 'Tiny', Description: null, RenderMode: 'Scroll', Settings: null }, pages: [], screens: [] },
      undefined,
      'v',
      [],
    );
    expect(parsePublishedDefinition(JSON.stringify(built))).toEqual(built);
  });
});
