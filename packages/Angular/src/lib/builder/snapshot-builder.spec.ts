import { describe, it, expect } from 'vitest';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
import { buildPublishedDefinition } from './snapshot-builder';
import type { FormTree, PageNode, QuestionNode } from './builder-models';

/**
 * The snapshot builder reads a small, typed subset of each entity's fields. We model
 * exactly that subset and assert through the real generated-entity type so the test
 * breaks if a field is renamed. `Partial<...> as Entity` keeps us honest about which
 * fields are read without standing up the full MJ entity machinery.
 */
function form(overrides: Partial<mjBizAppsFormsFormEntity>): mjBizAppsFormsFormEntity {
  return {
    ID: 'form-1',
    Name: 'Test Form',
    Description: null,
    RenderMode: 'Scroll',
    Settings: null,
    StyleID: null,
    ...overrides,
  } as mjBizAppsFormsFormEntity;
}

function page(id: string, order: number, overrides: Partial<mjBizAppsFormsFormPageEntity> = {}): PageNode {
  return {
    entity: {
      ID: id,
      Title: null,
      Description: null,
      DisplayOrder: order,
      ConditionalRule: null,
      ...overrides,
    } as mjBizAppsFormsFormPageEntity,
    questions: [],
  };
}

function question(
  id: string,
  order: number,
  overrides: Partial<mjBizAppsFormsFormQuestionEntity> = {},
  options: mjBizAppsFormsFormQuestionOptionEntity[] = [],
): QuestionNode {
  return {
    entity: {
      ID: id,
      QuestionType: 'ShortText',
      Prompt: `Question ${id}`,
      HelpText: null,
      IsRequired: false,
      DisplayOrder: order,
      ConditionalRule: null,
      ValidationRule: null,
      Settings: null,
      ...overrides,
    } as mjBizAppsFormsFormQuestionEntity,
    options,
  };
}

function option(
  id: string,
  label: string,
  order: number,
  overrides: Partial<mjBizAppsFormsFormQuestionOptionEntity> = {},
): mjBizAppsFormsFormQuestionOptionEntity {
  return {
    ID: id,
    Label: label,
    Value: null,
    DisplayOrder: order,
    IsDefault: false,
    ...overrides,
  } as mjBizAppsFormsFormQuestionOptionEntity;
}

describe('buildPublishedDefinition', () => {
  it('captures form-level metadata + settings + render mode', () => {
    const tree: FormTree = {
      form: form({
        Name: 'Survey',
        Description: 'desc',
        RenderMode: 'OneQuestion',
        Settings: '{"anonymousAllowed":false,"captchaRequired":true,"quota":50}',
      }),
      pages: [],
    };
    const def = buildPublishedDefinition(tree, undefined, 'ver-9');
    expect(def.formId).toBe('form-1');
    expect(def.formVersionId).toBe('ver-9');
    expect(def.name).toBe('Survey');
    expect(def.description).toBe('desc');
    expect(def.renderMode).toBe('OneQuestion');
    expect(def.settings.captchaRequired).toBe(true);
    expect(def.settings.quota).toBe(50);
  });

  it('orders pages and questions densely by DisplayOrder', () => {
    const p1 = page('p1', 5);
    const p0 = page('p0', 1);
    p1.questions = [question('q-b', 9), question('q-a', 2)];
    const tree: FormTree = { form: form({}), pages: [p1, p0] };

    const def = buildPublishedDefinition(tree, undefined, 'v');
    expect(def.pages.map((p) => p.id)).toEqual(['p0', 'p1']);
    expect(def.pages.map((p) => p.displayOrder)).toEqual([0, 1]);
    const second = def.pages[1];
    expect(second.questions.map((q) => q.id)).toEqual(['q-a', 'q-b']);
    expect(second.questions.map((q) => q.displayOrder)).toEqual([0, 1]);
  });

  it('parses conditional + validation rules into the snapshot', () => {
    const q = question('q1', 0, {
      ConditionalRule: '{"show":{"all":[{"questionId":"q0","op":"equals","value":"Yes"}]}}',
      ValidationRule: '{"minLength":3}',
      IsRequired: true,
    });
    const p = page('p', 0);
    p.questions = [q];
    const tree: FormTree = { form: form({}), pages: [p] };

    const def = buildPublishedDefinition(tree, undefined, 'v');
    const built = def.pages[0].questions[0];
    expect(built.isRequired).toBe(true);
    expect(built.conditionalRule?.show?.all?.[0].value).toBe('Yes');
    expect(built.validationRule?.minLength).toBe(3);
  });

  it('builds options with value defaulting to label and dense order', () => {
    const opts = [option('o2', 'Second', 5), option('o1', 'First', 1, { Value: 'first-val', IsDefault: true })];
    const q = question('q1', 0, { QuestionType: 'SingleChoice' }, opts);
    const p = page('p', 0);
    p.questions = [q];
    const tree: FormTree = { form: form({}), pages: [p] };

    const built = buildPublishedDefinition(tree, undefined, 'v').pages[0].questions[0];
    expect(built.options.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(built.options[0].value).toBe('first-val');
    expect(built.options[0].isDefault).toBe(true);
    expect(built.options[1].value).toBe('Second'); // defaults to label
    expect(built.options[1].isDefault).toBeUndefined();
  });

  it('resolves style tokens from the linked FormStyle', () => {
    const style = {
      CSSVariables: '{"--mj-brand-primary":"#123456"}',
      CustomCSS: '.x{}',
      LogoURL: 'https://logo',
    } as mjBizAppsFormsFormStyleEntity;
    const def = buildPublishedDefinition({ form: form({}), pages: [] }, style, 'v');
    expect(def.styleTokens.cssVariables['--mj-brand-primary']).toBe('#123456');
    expect(def.styleTokens.customCSS).toBe('.x{}');
    expect(def.styleTokens.logoURL).toBe('https://logo');
  });

  it('uses the styleTokensOverride verbatim when supplied (WYSIWYG preview of unsaved edits)', () => {
    const style = {
      CSSVariables: '{"--mjf-accent":"#000000"}',
      CustomCSS: null,
      LogoURL: null,
    } as mjBizAppsFormsFormStyleEntity;
    const override = { cssVariables: { '--mjf-accent': '#ff8800' }, logoURL: 'https://preview-logo' };
    const def = buildPublishedDefinition({ form: form({}), pages: [] }, style, 'v', override);
    // Override wins over the entity-derived tokens.
    expect(def.styleTokens.cssVariables['--mjf-accent']).toBe('#ff8800');
    expect(def.styleTokens.logoURL).toBe('https://preview-logo');
  });

  it('produces JSON-serializable output (round-trips through JSON)', () => {
    const p = page('p', 0);
    p.questions = [question('q1', 0)];
    const def = buildPublishedDefinition({ form: form({}), pages: [p] }, undefined, 'v');
    const roundTripped = JSON.parse(JSON.stringify(def));
    expect(roundTripped).toEqual(def);
  });
});
