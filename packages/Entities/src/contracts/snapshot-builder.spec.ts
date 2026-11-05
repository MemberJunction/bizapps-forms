import { describe, it, expect } from 'vitest';
import {
  UnreadableColumnError,
  buildPublishedDefinition,
  tryBuildPublishedDefinition,
  unreadableDraftMessage,
} from './snapshot-builder';
import { buildPublishedAutomations, type AuthoredAutomationRow } from './published-automation-builder';
import type {
  AuthoredFormRow,
  AuthoredFormTree,
  AuthoredOptionRow,
  AuthoredPageRow,
  AuthoredQuestionNode,
  AuthoredQuestionRow,
  AuthoredScreenRow,
  AuthoredStyleRow,
} from './authored-form';

/**
 * The builder takes structural rows (`Pick<Entity, …>`), so these fixtures are COMPLETE rows with
 * no casts — a column the builder starts reading fails to compile here until the fixture names it,
 * which is the point of the row types.
 */
function form(overrides: Partial<AuthoredFormRow> = {}): AuthoredFormRow {
  return {
    ID: 'form-1',
    Name: 'Test Form',
    Description: null,
    RenderMode: 'Scroll',
    Settings: null,
    ...overrides,
  };
}

/** A page node the test can still add questions to (the contract's node is read-only). */
interface PageFixture {
  entity: AuthoredPageRow;
  questions: AuthoredQuestionNode[];
}

function page(id: string, order: number, overrides: Partial<AuthoredPageRow> = {}): PageFixture {
  return {
    entity: {
      ID: id,
      Title: null,
      Description: null,
      DisplayOrder: order,
      IsPartialSubmitPoint: false,
      ConditionalRule: null,
      ...overrides,
    },
    questions: [],
  };
}

function question(
  id: string,
  order: number,
  overrides: Partial<AuthoredQuestionRow> = {},
  options: AuthoredOptionRow[] = [],
): AuthoredQuestionNode {
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
      ScoringConfig: null,
      Settings: null,
      ...overrides,
    },
    options,
  };
}

function option(
  id: string,
  label: string,
  order: number,
  overrides: Partial<AuthoredOptionRow> = {},
): AuthoredOptionRow {
  return {
    ID: id,
    Label: label,
    Value: null,
    DisplayOrder: order,
    IsDefault: false,
    ImageURL: null,
    MatrixAxis: null,
    ...overrides,
  };
}

function screen(overrides: Partial<AuthoredScreenRow> = {}): AuthoredScreenRow {
  return {
    ID: 'e1',
    ScreenType: 'Ending',
    Title: 'Thanks',
    Body: null,
    ButtonLabel: null,
    MediaURL: null,
    RedirectURL: null,
    DisplayOrder: 0,
    ConditionalRule: null,
    IsDefault: true,
    IsDisqualification: false,
    SocialLinks: null,
    ...overrides,
  };
}

function style(overrides: Partial<AuthoredStyleRow> = {}): AuthoredStyleRow {
  return { CSSVariables: null, CustomCSS: null, LogoURL: null, ...overrides };
}

describe('buildPublishedDefinition', () => {
  it('captures form-level metadata + settings + render mode', () => {
    const tree: AuthoredFormTree = {
      form: form({
        Name: 'Survey',
        Description: 'desc',
        RenderMode: 'OneQuestion',
        Settings: '{"anonymousAllowed":false,"captchaRequired":true,"quota":50}',
      }),
      pages: [],
      screens: [],
    };
    const def = buildPublishedDefinition(tree, undefined, 'ver-9', []);
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
    const tree: AuthoredFormTree = { form: form({}), pages: [p1, p0], screens: [] };

    const def = buildPublishedDefinition(tree, undefined, 'v', []);
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
    const tree: AuthoredFormTree = { form: form({}), pages: [p], screens: [] };

    const def = buildPublishedDefinition(tree, undefined, 'v', []);
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
    const tree: AuthoredFormTree = { form: form({}), pages: [p], screens: [] };

    const built = buildPublishedDefinition(tree, undefined, 'v', []).pages[0].questions[0];
    expect(built.options.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(built.options[0].value).toBe('first-val');
    expect(built.options[0].isDefault).toBe(true);
    expect(built.options[1].value).toBe('Second'); // defaults to label
    expect(built.options[1].isDefault).toBeUndefined();
  });

  it('resolves style tokens from the linked FormStyle', () => {
    const linked = style({
      CSSVariables: '{"--mj-brand-primary":"#123456"}',
      CustomCSS: '.x{}',
      LogoURL: 'https://logo',
    });
    const def = buildPublishedDefinition({ form: form({}), pages: [], screens: [] }, linked, 'v', []);
    expect(def.styleTokens.cssVariables['--mj-brand-primary']).toBe('#123456');
    expect(def.styleTokens.customCSS).toBe('.x{}');
    expect(def.styleTokens.logoURL).toBe('https://logo');
  });

  it('uses the non-asset values of a styleTokensOverride as given when supplied (WYSIWYG preview of unsaved edits)', () => {
    const linked = style({ CSSVariables: '{"--mjf-accent":"#000000"}' });
    const override = { cssVariables: { '--mjf-accent': '#ff8800' }, logoURL: 'https://preview-logo' };
    const def = buildPublishedDefinition({ form: form({}), pages: [], screens: [] }, linked, 'v', [], override);
    // Override wins over the entity-derived tokens.
    expect(def.styleTokens.cssVariables['--mjf-accent']).toBe('#ff8800');
    expect(def.styleTokens.logoURL).toBe('https://preview-logo');
  });

  it('produces JSON-serializable output (round-trips through JSON)', () => {
    const p = page('p', 0);
    p.questions = [question('q1', 0)];
    const def = buildPublishedDefinition({ form: form({}), pages: [p], screens: [] }, undefined, 'v', []);
    const roundTripped = JSON.parse(JSON.stringify(def));
    expect(roundTripped).toEqual(def);
  });

  it('carries the automations it is given into the snapshot', () => {
    const automations = buildPublishedAutomations([automationRow({ ID: 'a1' })], []);

    const def = buildPublishedDefinition({ form: form({}), pages: [], screens: [] }, undefined, 'v', automations);

    expect(def.automations.map((a) => a.id)).toEqual(['a1']);
  });
});

function automationRow(overrides: Partial<AuthoredAutomationRow> = {}): AuthoredAutomationRow {
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

describe('buildPublishedDefinition social links', () => {
  function endingWith(socialLinks: string | null): AuthoredScreenRow {
    return screen({ SocialLinks: socialLinks });
  }

  it('carries an ending screen social links into the snapshot', () => {
    const raw = JSON.stringify([{ platform: 'linkedin', url: 'https://linkedin.com/company/x' }]);
    const def = buildPublishedDefinition(
      { form: form({}), pages: [], screens: [endingWith(raw)] },
      undefined,
      'v',
      [],
    );

    expect(def.endScreens?.[0]?.socialLinks).toEqual([
      { platform: 'linkedin', url: 'https://linkedin.com/company/x' },
    ]);
  });

  it('omits the field entirely when there are none', () => {
    const def = buildPublishedDefinition(
      { form: form({}), pages: [], screens: [endingWith(null)] },
      undefined,
      'v',
      [],
    );

    expect(def.endScreens?.[0]?.socialLinks).toBeUndefined();
  });
});

describe('buildPublishedDefinition asset references (#270)', () => {
  const ID = '0b5f3c1e-8a2d-4c6f-9e1a-7d3b2c4e5f60';
  // What every upload stored before #270: the absolute URL of whichever MJAPI took it.
  const LEGACY = `http://localhost:4000/forms/asset/${ID}`;
  const REF = `/forms/asset/${ID}`;
  const EXTERNAL = 'https://cdn.example.com/cat.png';

  /** A welcome screen whose media still holds a pre-#270 absolute upload URL. */
  function welcome(mediaURL: string): AuthoredScreenRow {
    return screen({ ID: 'w1', ScreenType: 'Welcome', Title: 'Hi', MediaURL: mediaURL, IsDefault: false });
  }

  it('publishes legacy absolute upload URLs as host-independent references', () => {
    const p = page('p', 0);
    p.questions = [
      question('q', 0, { QuestionType: 'PictureChoice' }, [
        option('o1', 'Ours', 0, { ImageURL: LEGACY }),
        option('o2', 'Theirs', 1, { ImageURL: EXTERNAL }),
      ]),
    ];
    const linked = style({ CSSVariables: `{"--mjf-bg-image":"url('${LEGACY}')"}`, LogoURL: LEGACY });

    const def = buildPublishedDefinition(
      { form: form({}), pages: [p], screens: [welcome(LEGACY)] },
      linked,
      'v',
      [],
    );

    expect(def.welcomeScreen?.mediaURL).toBe(REF);
    expect(def.pages[0].questions[0].options.map((o) => o.imageURL)).toEqual([REF, EXTERNAL]);
    expect(def.styleTokens.logoURL).toBe(REF);
    expect(def.styleTokens.cssVariables['--mjf-bg-image']).toBe(`url('${REF}')`);
  });

  it('relativises an uploaded-image URL inside a styleTokensOverride, like every other asset reference', () => {
    const def = buildPublishedDefinition(
      { form: form({}), pages: [], screens: [] },
      undefined,
      'v',
      [],
      { cssVariables: {}, logoURL: LEGACY },
    );

    expect(def.styleTokens.logoURL).toBe(REF);
  });
});

/**
 * DW6 (contracts half): a rule the zod schema rejects is REFUSED at publish, naming the item.
 *
 * The tolerant parser this replaced cast any JSON object through as a rule, so a malformed one was
 * frozen into the immutable snapshot — where the server's parser then dropped it on every public
 * load, which for a show rule makes the guarded item visible to every respondent.
 */
describe('buildPublishedDefinition refuses rules it cannot read', () => {
  const BAD_OPERATOR = JSON.stringify({ show: { all: [{ questionId: 'q0', op: 'bogus' }] } });

  function treeWithQuestion(overrides: Partial<AuthoredQuestionRow>): AuthoredFormTree {
    const p = page('p', 0);
    p.questions = [question('q1', 0, { Prompt: 'Your age', ...overrides })];
    return { form: form(), pages: [p], screens: [] };
  }

  it('refuses a question show rule with an unknown operator, naming the question', () => {
    expect(() => buildPublishedDefinition(treeWithQuestion({ ConditionalRule: BAD_OPERATOR }), undefined, 'v', []))
      .toThrow(/question "Your age" \(q1\) ConditionalRule/);
  });

  it('throws a typed error, so an interactive caller can tell an unreadable draft from a bug', () => {
    let caught: unknown;
    try {
      buildPublishedDefinition(treeWithQuestion({ ConditionalRule: BAD_OPERATOR }), undefined, 'v', []);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnreadableColumnError);
    expect((caught as UnreadableColumnError).column).toBe('question "Your age" (q1) ConditionalRule');
    expect((caught as UnreadableColumnError).reason).toMatch(/op/);
  });

  it('refuses a validation rule of the wrong type', () => {
    expect(() =>
      buildPublishedDefinition(treeWithQuestion({ ValidationRule: '{"minLength":"three"}' }), undefined, 'v', []),
    ).toThrow(/ValidationRule cannot be read — minLength/);
  });

  it('refuses a rule column that is not JSON', () => {
    expect(() => buildPublishedDefinition(treeWithQuestion({ ConditionalRule: '{oops' }), undefined, 'v', []))
      .toThrow(/not valid JSON/);
  });

  it('refuses a page rule and an ending rule the same way', () => {
    const p = page('p1', 0, { Title: 'About you', ConditionalRule: BAD_OPERATOR });
    expect(() => buildPublishedDefinition({ form: form(), pages: [p], screens: [] }, undefined, 'v', []))
      .toThrow(/page "About you" \(p1\)/);
    expect(() =>
      buildPublishedDefinition(
        { form: form(), pages: [], screens: [screen({ Title: 'Bye', ConditionalRule: BAD_OPERATOR })] },
        undefined,
        'v',
        [],
      ),
    ).toThrow(/screen "Bye" \(e1\)/);
  });

  it('refuses stored form settings of the wrong type, but defaults the ones that are absent', () => {
    expect(() =>
      buildPublishedDefinition({ form: form({ Settings: '{"quota":"fifty"}' }), pages: [], screens: [] }, undefined, 'v', []),
    ).toThrow(/Settings cannot be read — quota/);

    const def = buildPublishedDefinition({ form: form({ Settings: '{"quota":5}' }), pages: [], screens: [] }, undefined, 'v', []);
    expect(def.settings).toEqual({ anonymousAllowed: true, captchaRequired: false, quota: 5 });
  });

  it('normalises a legacy page-only jump to the tagged shape, exactly as the server parser reads it', () => {
    const q = question('q1', 0, {
      ConditionalRule: JSON.stringify({ jump: [{ when: { all: [{ questionId: 'q1', op: 'isAnswered' }] }, toPageId: 'p2' }] }),
    });
    const p = page('p', 0);
    p.questions = [q];
    const def = buildPublishedDefinition({ form: form(), pages: [p], screens: [] }, undefined, 'v', []);
    expect(def.pages[0].questions[0].conditionalRule?.jump?.[0].target).toEqual({ kind: 'page', id: 'p2' });
  });

  it('reads an empty rule column as no rule', () => {
    const def = buildPublishedDefinition(treeWithQuestion({ ConditionalRule: '   ', ValidationRule: '' }), undefined, 'v', []);
    expect(def.pages[0].questions[0].conditionalRule).toBeUndefined();
    expect(def.pages[0].questions[0].validationRule).toBeUndefined();
  });
});

describe('tryBuildPublishedDefinition', () => {
  it('returns the definition when every column reads', () => {
    const built = tryBuildPublishedDefinition({ form: form(), pages: [], screens: [] }, undefined, 'v', []);
    expect(built.ok && built.definition.formVersionId).toBe('v');
  });

  it('returns the unreadable column as a result instead of throwing', () => {
    const p = page('p1', 0, { Title: 'About you', ConditionalRule: '{oops' });
    const built = tryBuildPublishedDefinition({ form: form(), pages: [p], screens: [] }, undefined, 'v', []);
    expect(built.ok).toBe(false);
    expect(!built.ok && built.error).toBeInstanceOf(UnreadableColumnError);
    expect(!built.ok && built.error.column).toBe('page "About you" (p1) ConditionalRule');
  });
});

describe('unreadableDraftMessage — the one wording of an unreadable column (#303)', () => {
  it('names the column and the reason, worded for the action the author took', () => {
    const problem = { column: 'question "Age" (q1) ValidationRule', reason: 'min: Expected number' };
    expect(unreadableDraftMessage('publish', problem)).toBe(
      'Cannot publish: the question "Age" (q1) ValidationRule cannot be read — min: Expected number.',
    );
    expect(unreadableDraftMessage('preview', problem)).toBe(
      'Cannot preview: the question "Age" (q1) ValidationRule cannot be read — min: Expected number.',
    );
  });

  it('is what UnreadableColumnError says, so the publish refusal and the builder banner cannot drift', () => {
    const error = new UnreadableColumnError('page "About you" (p1) ConditionalRule', 'not valid JSON');
    expect(error.message).toBe(unreadableDraftMessage('publish', error));
  });
});
