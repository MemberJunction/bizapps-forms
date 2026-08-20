import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * In-memory fake of the MJ entity layer so we can exercise the deterministic Builder
 * (the Designer→Builder pipeline) with NO database. We mock `@memberjunction/core`'s
 * `Metadata` to hand back tiny fake entities that record their assigned field values
 * into a shared `saved` array on Save().
 *
 * The builder only ever assigns known scalar props (FormID, Status, …) and reads `.ID`
 * + `.LatestResult`, so a plain object whose own-enumerable props we snapshot on Save
 * is a faithful stand-in.
 */
interface SavedRow {
  entity: string;
  fields: Record<string, unknown>;
}

const saved: SavedRow[] = [];
let failOn: string | null = null;

/**
 * A failure that heals: the next `times` saves of `entity` fail with `detail`, then succeed.
 *
 * Distinct from `failOn`, which fails forever. The bounded persist retry is only observable when a
 * failure eventually stops — a permanently-failing row proves the cap fires but says nothing about
 * whether the repair between attempts actually worked.
 */
let failTimes: { entity: string; times: number; detail: string } | null = null;

/** Rows minted so far, so NewRecord can hand out a stable unique id. */
let minted = 0;

class FakeEntity {
  ID = '';
  /** Mutable so a test can choose the provider wording the repair classifier will see. */
  _failureDetail = 'forced failure';
  constructor(private readonly entityName: string) {}

  get LatestResult(): { Message: string; CompleteMessage: string } {
    return { Message: this._failureDetail, CompleteMessage: this._failureDetail };
  }

  NewRecord(): void {
    // MJ assigns the primary key CLIENT-SIDE here, before the insert — the generated SQL passes
    // @ID explicitly. The fake does the same, because the collision repair reads that id on its
    // last attempt and a fake that left it blank could never exercise that path.
    this.ID = fakeGuid(++minted);
  }

  async Save(): Promise<boolean> {
    if (failOn === this.entityName) {
      return false;
    }
    if (failTimes && failTimes.entity === this.entityName && failTimes.times > 0) {
      failTimes.times--;
      this._failureDetail = failTimes.detail;
      return false;
    }
    // A real GUID shape, because the Builder now refuses to interpolate anything else into a
    // filter — and a fake that mints ids the production code would reject is a fake that
    // cannot exercise the path it is standing in for.
    this.ID = fakeGuid(saved.length + 1);
    saved.push({ entity: this.entityName, fields: snapshot(this) });
    return true;
  }
}

/** Snapshot the business fields an instance has accumulated (own enumerable, minus internals). */
/**
 * A deterministic GUID for the fake's rows.
 *
 * Deterministic rather than random so a failing assertion names the same id twice in a row, and
 * genuinely GUID-shaped so it survives the Builder's injection guard.
 */
function fakeGuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function snapshot(entity: FakeEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key === 'entityName' || key === '_failureDetail') {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * PARTIAL mock: spread the real module, then override only what this test fakes.
 *
 * It used to REPLACE the module with a two-export object, which worked only for as long as
 * nothing else in the import graph needed a third export. `form-blueprint.ts` deriving its type
 * enum from the shared contract at RUNTIME (rather than via an erased `import type`) pulled the
 * generated entity subclasses in behind it, and the whole file then failed to load with
 * `No "BaseEntity" export is defined on the mock` — a failure about a symbol this test never
 * mentions. `importOriginal` keeps the override to the two classes it actually fakes.
 */
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  Metadata: class {
    async GetEntityObject(entityName: string): Promise<FakeEntity> {
      return new FakeEntity(entityName);
    }
  },
  UserInfo: class {},
}));

// Import AFTER the mock is registered.
import { buildFormFromBlueprint } from './form-blueprint-builder';
import { UserInfo } from '@memberjunction/core';
import type { FormBlueprint } from './form-blueprint';

const user = new UserInfo();

const blueprint: FormBlueprint = {
  name: 'Event RSVP',
  renderMode: 'Scroll',
  confirmationMessage: 'See you there!',
  pages: [
    {
      title: 'RSVP',
      questions: [
        { type: 'Email', prompt: 'Email', isRequired: true },
        { type: 'Number', prompt: '+1 count', settings: { min: 0, max: 10 } },
        {
          type: 'MultiChoice',
          prompt: 'Dietary restrictions',
          options: [{ label: 'Vegan' }, { label: 'None', value: 'none' }],
        },
        // Non-choice with stray options — builder must NOT persist options for it.
        { type: 'ShortText', prompt: 'Name', options: [{ label: 'ignored' }] },
      ],
    },
  ],
};

const byEntity = (name: string): SavedRow[] => saved.filter((r) => r.entity === name);

describe('buildFormFromBlueprint', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    failTimes = null;
  });

  it('persists a form, a draft version, one page, four questions and two options', async () => {
    const result = await buildFormFromBlueprint(blueprint, user);
    expect(result.pageCount).toBe(1);
    expect(result.questionCount).toBe(4);
    expect(result.optionCount).toBe(2); // only the MultiChoice options

    expect(byEntity('MJ_BizApps_Forms: Forms')).toHaveLength(1);
    expect(byEntity('MJ_BizApps_Forms: Form Versions')).toHaveLength(1);
    expect(byEntity('MJ_BizApps_Forms: Form Pages')).toHaveLength(1);
    expect(byEntity('MJ_BizApps_Forms: Form Questions')).toHaveLength(4);
    expect(byEntity('MJ_BizApps_Forms: Form Question Options')).toHaveLength(2);
  });

  it('sets the form to Draft with the right render mode and a settings JSON', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const form = byEntity('MJ_BizApps_Forms: Forms')[0];
    expect(form.fields.Status).toBe('Draft');
    expect(form.fields.RenderMode).toBe('Scroll');
    const settings = JSON.parse(String(form.fields.Settings));
    expect(settings.confirmationMessage).toBe('See you there!');
    expect(settings.anonymousAllowed).toBe(true);
  });

  it('marks the draft version as Draft, version 1', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const version = byEntity('MJ_BizApps_Forms: Form Versions')[0];
    expect(version.fields.Status).toBe('Draft');
    expect(version.fields.VersionNumber).toBe(1);
  });

  it('wires each question to the form and page ids', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const formId = byEntity('MJ_BizApps_Forms: Forms')[0].fields.ID;
    const pageId = byEntity('MJ_BizApps_Forms: Form Pages')[0].fields.ID;
    for (const q of byEntity('MJ_BizApps_Forms: Form Questions')) {
      expect(q.fields.FormID).toBe(formId);
      expect(q.fields.PageID).toBe(pageId);
    }
  });

  it('serializes per-type settings onto the question', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const numberQ = byEntity('MJ_BizApps_Forms: Form Questions').find((r) => r.fields.QuestionType === 'Number');
    expect(JSON.parse(String(numberQ?.fields.Settings))).toEqual({ min: 0, max: 10 });
  });

  it('defaults an option value to its label when omitted', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const vegan = byEntity('MJ_BizApps_Forms: Form Question Options').find((o) => o.fields.Label === 'Vegan');
    expect(vegan?.fields.Value).toBe('Vegan');
  });

  it('throws a FormPersistError when a Save fails', async () => {
    failOn = 'MJ_BizApps_Forms: Form Pages';
    await expect(buildFormFromBlueprint(blueprint, user)).rejects.toThrow(/Failed to save FormPage/);
  });
});

// --- Extended builder: rules, screens, style, repair --------------------------------

const ENTITY_NAME = {
  form: 'MJ_BizApps_Forms: Forms',
  page: 'MJ_BizApps_Forms: Form Pages',
  question: 'MJ_BizApps_Forms: Form Questions',
  option: 'MJ_BizApps_Forms: Form Question Options',
  screen: 'MJ_BizApps_Forms: Form Screens',
  style: 'MJ_BizApps_Forms: Form Styles',
} as const;

/** A form whose second question and second page are gated by the first question's answer. */
const gatedBlueprint: FormBlueprint = {
  name: 'Conference RSVP',
  pages: [
    {
      title: 'Attendance',
      questions: [
        { key: 'attending', type: 'YesNo', prompt: 'Will you attend?' },
        {
          key: 'diet',
          type: 'ShortText',
          prompt: 'Dietary needs',
          validationRule: { maxLength: 200 },
          conditionalRule: { show: { all: [{ questionKey: 'attending', op: 'equals', value: true }] } },
        },
      ],
    },
    {
      title: 'Travel',
      questions: [{ type: 'YesNo', prompt: 'Need a hotel?' }],
      conditionalRule: { show: { all: [{ questionKey: 'attending', op: 'isAnswered' }] } },
    },
  ],
  screens: {
    welcome: { title: 'Welcome', body: 'Two minutes.', buttonLabel: 'Start' },
    endings: [
      {
        title: 'See you there',
        conditionalRule: { show: { all: [{ questionKey: 'diet', op: 'isAnswered' }] } },
      },
      { title: 'Thanks for letting us know' },
    ],
  },
};

const questionIdFor = (prompt: string): unknown =>
  byEntity(ENTITY_NAME.question).find((q) => q.fields.Prompt === prompt)?.fields.ID;

describe('buildFormFromBlueprint — conditional and validation rules', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    failTimes = null;
  });

  it('substitutes real question ids for blueprint keys on a question rule', async () => {
    await buildFormFromBlueprint(gatedBlueprint, user);
    const diet = byEntity(ENTITY_NAME.question).find((q) => q.fields.Prompt === 'Dietary needs');
    const rule = JSON.parse(String(diet?.fields.ConditionalRule));
    expect(rule.show.all[0].questionId).toBe(questionIdFor('Will you attend?'));
    expect(rule.show.all[0].value).toBe(true);
    // The key must not survive beside the id it was replaced by — a stray property here would
    // be stored forever and read by nothing.
    expect(rule.show.all[0].questionKey).toBeUndefined();
  });

  it('substitutes ids on a page rule and on an ending rule', async () => {
    await buildFormFromBlueprint(gatedBlueprint, user);
    const travel = byEntity(ENTITY_NAME.page).find((p) => p.fields.Title === 'Travel');
    expect(JSON.parse(String(travel?.fields.ConditionalRule)).show.all[0].questionId).toBe(
      questionIdFor('Will you attend?'),
    );
    // An ending may reference the LAST question, so screens must be written after every page.
    const ending = byEntity(ENTITY_NAME.screen).find((s) => s.fields.Title === 'See you there');
    expect(JSON.parse(String(ending?.fields.ConditionalRule)).show.all[0].questionId).toBe(
      questionIdFor('Dietary needs'),
    );
  });

  it('writes NULL, not an empty object, for a question with no rule', async () => {
    await buildFormFromBlueprint(gatedBlueprint, user);
    const attending = byEntity(ENTITY_NAME.question).find((q) => q.fields.Prompt === 'Will you attend?');
    expect(attending?.fields.ConditionalRule).toBeNull();
  });

  it('persists a validation rule and leaves it off questions without one', async () => {
    await buildFormFromBlueprint(gatedBlueprint, user);
    const diet = byEntity(ENTITY_NAME.question).find((q) => q.fields.Prompt === 'Dietary needs');
    expect(JSON.parse(String(diet?.fields.ValidationRule))).toEqual({ maxLength: 200 });
    const attending = byEntity(ENTITY_NAME.question).find((q) => q.fields.Prompt === 'Will you attend?');
    expect(attending?.fields.ValidationRule).toBeUndefined();
  });

  it('throws when a rule names a key no question carries', async () => {
    // Unreachable from the AI path (the schema rejects it first) but reachable from the starter
    // templates, which hand hand-written blueprints straight to the builder.
    const broken: FormBlueprint = {
      name: 'Broken',
      pages: [
        {
          questions: [
            {
              type: 'ShortText',
              prompt: 'Why?',
              conditionalRule: { show: { all: [{ questionKey: 'ghost', op: 'isAnswered' }] } },
            },
          ],
        },
      ],
    };
    await expect(buildFormFromBlueprint(broken, user)).rejects.toThrow(/references question key "ghost"/);
  });
});

describe('buildFormFromBlueprint — screens', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    failTimes = null;
  });

  it('creates one welcome and both endings, in order', async () => {
    const result = await buildFormFromBlueprint(gatedBlueprint, user);
    expect(result.screenCount).toBe(3);
    const screens = byEntity(ENTITY_NAME.screen);
    expect(screens.filter((s) => s.fields.ScreenType === 'Welcome')).toHaveLength(1);
    const endings = screens.filter((s) => s.fields.ScreenType === 'Ending');
    expect(endings.map((e) => e.fields.DisplayOrder)).toEqual([0, 1]);
  });

  it('carries the welcome copy and button label through', async () => {
    await buildFormFromBlueprint(gatedBlueprint, user);
    const welcome = byEntity(ENTITY_NAME.screen).find((s) => s.fields.ScreenType === 'Welcome');
    expect(welcome?.fields.Title).toBe('Welcome');
    expect(welcome?.fields.Body).toBe('Two minutes.');
    expect(welcome?.fields.ButtonLabel).toBe('Start');
  });

  it('forces exactly one default ending when the Designer marked none', async () => {
    // Zero defaults is not a neutral state: resolution falls through to the first UNCONDITIONAL
    // ending, so a set where the first is conditional leaves a non-matching respondent with the
    // bare confirmation string after a successful submit.
    await buildFormFromBlueprint(gatedBlueprint, user);
    const defaults = byEntity(ENTITY_NAME.screen).filter(
      (s) => s.fields.ScreenType === 'Ending' && s.fields.IsDefault === true,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].fields.Title).toBe('See you there');
  });

  it('keeps the Designer’s default when it marked one, and only that one', async () => {
    const withDefault: FormBlueprint = {
      ...gatedBlueprint,
      screens: {
        endings: [
          { title: 'First' },
          { title: 'Second', isDefault: true },
          { title: 'Third', isDefault: true },
        ],
      },
    };
    await buildFormFromBlueprint(withDefault, user);
    const defaults = byEntity(ENTITY_NAME.screen).filter((s) => s.fields.IsDefault === true);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].fields.Title).toBe('Second');
  });

  it('creates no screens for a blueprint that declares none', async () => {
    const result = await buildFormFromBlueprint(blueprint, user);
    expect(result.screenCount).toBe(0);
    expect(byEntity(ENTITY_NAME.screen)).toHaveLength(0);
  });
});

describe('buildFormFromBlueprint — style', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    failTimes = null;
  });

  it('creates a per-form style and links it on the form’s single insert', async () => {
    const result = await buildFormFromBlueprint(blueprint, user);
    const style = byEntity(ENTITY_NAME.style);
    expect(style).toHaveLength(1);
    expect(style[0].fields.Name).toBe('Event RSVP theme');
    // DisplayRank 0 is what keeps it out of the shared gallery AND what makes the Design tab
    // edit it in place instead of forking a preset.
    expect(style[0].fields.DisplayRank).toBe(0);
    // One Form row, not two: the style exists before the form, so StyleID rides the insert.
    const forms = byEntity(ENTITY_NAME.form);
    expect(forms).toHaveLength(1);
    expect(forms[0].fields.StyleID).toBe(style[0].fields.ID);
    expect(result.styleId).toBe(style[0].fields.ID);
  });

  it('renames on a duplicate-key failure and saves on the retry', async () => {
    // UQ_FormStyle_Name is real, and the name is derived from the form's — so a second form
    // generated from the same brief collides here and nowhere else.
    failTimes = {
      entity: ENTITY_NAME.style,
      times: 1,
      detail: "Violation of UNIQUE KEY constraint 'UQ_FormStyle_Name'. Cannot insert duplicate key row.",
    };
    const result = await buildFormFromBlueprint(blueprint, user);
    expect(byEntity(ENTITY_NAME.style)[0].fields.Name).toBe('Event RSVP theme (2)');
    expect(result.styleId).toBeDefined();
  });

  it('gives up after the attempt cap and still delivers the form', async () => {
    failTimes = { entity: ENTITY_NAME.style, times: 99, detail: 'Cannot insert duplicate key row.' };
    const result = await buildFormFromBlueprint(blueprint, user);
    // Degraded, not fatal: a theme is an enhancement, so an unwritable style must not discard a
    // finished form. The author lands on the widget defaults and gets a style on first edit.
    expect(result.styleId).toBeUndefined();
    expect(byEntity(ENTITY_NAME.style)).toHaveLength(0);
    expect(byEntity(ENTITY_NAME.form)).toHaveLength(1);
    expect(byEntity(ENTITY_NAME.form)[0].fields.StyleID).toBeUndefined();
    expect(result.questionCount).toBe(4);
  });

  it('does not retry a failure that is not a duplicate key', async () => {
    // A repair that fires on failures it does not understand burns the whole attempt budget and
    // reports the wrong cause. One attempt, then the provider's own detail.
    failTimes = { entity: ENTITY_NAME.style, times: 1, detail: 'Some unrelated provider failure' };
    const result = await buildFormFromBlueprint(blueprint, user);
    expect(result.styleId).toBeUndefined();
  });
});

describe('buildFormFromBlueprint — bounded columns', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    failTimes = null;
  });

  it('clamps over-long values to their column width instead of failing the save', async () => {
    const long = (n: number): string => 'x'.repeat(n);
    const oversized: FormBlueprint = {
      name: long(400),
      pages: [
        {
          title: long(400),
          questions: [
            { type: 'SingleChoice', prompt: 'Pick', options: [{ label: long(900) }] },
          ],
        },
      ],
      screens: { welcome: { title: long(900), buttonLabel: long(300) }, endings: [] },
    };
    await buildFormFromBlueprint(oversized, user);
    expect(String(byEntity(ENTITY_NAME.form)[0].fields.Name)).toHaveLength(255);
    expect(String(byEntity(ENTITY_NAME.page)[0].fields.Title)).toHaveLength(255);
    expect(String(byEntity(ENTITY_NAME.option)[0].fields.Label)).toHaveLength(500);
    const welcome = byEntity(ENTITY_NAME.screen)[0];
    expect(String(welcome.fields.Title)).toHaveLength(500);
    expect(String(welcome.fields.ButtonLabel)).toHaveLength(100);
    // The ellipsis is what makes a truncation visible to whoever reads the row later.
    expect(String(byEntity(ENTITY_NAME.form)[0].fields.Name).endsWith('…')).toBe(true);
  });

  it('leaves values that already fit exactly as authored', async () => {
    await buildFormFromBlueprint(blueprint, user);
    expect(byEntity(ENTITY_NAME.form)[0].fields.Name).toBe('Event RSVP');
  });
});

describe('buildFormFromBlueprint — partial failures', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    failTimes = null;
  });

  it('carries the form id on a failure after the form was created', async () => {
    // Without the id the Draft row is an orphan nobody can find. With it the caller can report a
    // reviewable partial draft, which is the whole point of leaving the row in place.
    failOn = ENTITY_NAME.question;
    await expect(buildFormFromBlueprint(blueprint, user)).rejects.toMatchObject({
      name: 'FormPersistError',
      formId: byEntity(ENTITY_NAME.form)[0]?.fields.ID ?? expect.any(String),
    });
  });
});

describe('buildFormFromBlueprint — repeated style-name collisions', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    failTimes = null;
  });

  it('falls back to the row id when counting up runs out of attempts', async () => {
    // Counting up survives only as many collisions as there are attempts, so a tenant generating a
    // FOURTH form with the same name lost its style entirely. The id is assigned before the insert
    // and is unique by construction, so the last attempt uses that instead of guessing again.
    failTimes = { entity: ENTITY_NAME.style, times: 2, detail: 'Cannot insert duplicate key row.' };
    const result = await buildFormFromBlueprint(blueprint, user);
    const name = String(byEntity(ENTITY_NAME.style)[0].fields.Name);
    expect(result.styleId).toBeDefined();
    expect(name.startsWith('Event RSVP theme (')).toBe(true);
    // Not the counted form — that is what just failed twice.
    expect(name).not.toBe('Event RSVP theme (3)');
  });
});
