/**
 * The two authoring Actions as thin wrappers over `FormAuthoringEngine` (#303): what they read from
 * their params (`PublishImmediately` especially), which provider they hand the engine, and how they
 * report each outcome. The build itself is pinned in forms-core-entities-server's
 * `FormAuthoringEngine.spec.ts`; this runs it end to end over the emulated database with the real
 * Form / Form Version server subclasses, so "published" here means the invariants allowed it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import {
  ACTIONS,
  AUTHOR,
  FORMS,
  VERSIONS,
  draftTables,
  formsWorld,
  rowsOf,
  type FakeProvider,
  type FakeProviderConfig,
  type FakeRow,
  type ServerSubclasses,
} from '@mj-biz-apps/forms-core-entities-server/testing';
import { STUB_DESIGNER, actionParams, output } from './authoring-harness';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

vi.mock('@mj-biz-apps/forms-entities', async (importOriginal) => {
  const { WriteThroughEntityBase } = await import('@mj-biz-apps/forms-core-entities-server/testing');
  return {
    ...(await importOriginal<typeof import('@mj-biz-apps/forms-entities')>()),
    mjBizAppsFormsFormEntity: WriteThroughEntityBase,
    mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase,
  };
});

const { FormEntityServer, FormVersionEntityServer } = await import('@mj-biz-apps/forms-core-entities-server');
const { GenerateFormFromBriefAction, setFormDesignerModel } = await import('../generate-form.action');
const { CreateFormFromTemplateAction } = await import('../../templates/create-form-from-template.action');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

/** A fresh database; the author may update Forms unless `config` says otherwise. */
function freshWorld(config: Partial<FakeProviderConfig> = {}): FakeProvider {
  const tables: Record<string, FakeRow[]> = Object.fromEntries(Object.keys(draftTables()).map((name) => [name, []]));
  tables[ACTIONS] = [{ ID: 'action-email', Name: 'Forms: Send Confirmation Email' }];
  return formsWorld(SUBCLASSES, tables, { updatePermissions: { [FORMS]: true }, ...config });
}

/** The Designer, spied, so a spec can prove the LLM never ran on a refused request. */
const design = vi.fn(STUB_DESIGNER.design);

const generate = (db: FakeProvider | undefined, inputs: Record<string, unknown>) => {
  const params = actionParams(db?.provider, AUTHOR, { Brief: 'an RSVP', ...inputs });
  return { params, run: new GenerateFormFromBriefAction().Run(params) };
};

let original: IMetadataProvider | undefined;
beforeEach(() => {
  try {
    original = Metadata.Provider;
  } catch {
    original = undefined;
  }
  design.mockClear();
  setFormDesignerModel({ design });
});
afterEach(() => {
  Metadata.Provider = original as IMetadataProvider;
});

describe('Forms: Generate Form From Brief', () => {
  it('leaves a Draft when PublishImmediately is not given — and writes no version at all', async () => {
    const db = freshWorld();
    const { params, run } = generate(db, {});

    const result = await run;

    expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
    expect(result.Message).toMatch(/left as a draft/);
    expect(rowsOf(db, FORMS).map((f) => f.Status)).toEqual(['Draft']);
    expect(rowsOf(db, VERSIONS)).toEqual([]);
    expect(output(params, 'FormID')).toBe(rowsOf(db, FORMS)[0].ID);
    expect(output(params, 'QuestionCount')).toBe(3);
    // #303: nothing read it, and there is no Draft version any more to name.
    expect(output(params, 'FormVersionID')).toBeUndefined();
  });

  it.each([true, 'true', 'TRUE'])('publishes in the same transaction when PublishImmediately is %j', async (flag) => {
    const db = freshWorld();

    const result = await generate(db, { PublishImmediately: flag }).run;

    expect(result.Message).toMatch(/published as version 1/);
    expect(rowsOf(db, FORMS).map((f) => f.Status)).toEqual(['Published']);
    expect(rowsOf(db, VERSIONS).map((v) => v.Status)).toEqual(['Published']);
    expect(db.transactions).toEqual(['begin', 'begin:nested', 'commit:nested', 'commit']);
  });

  it.each([false, 'false', null, ''])('treats PublishImmediately %j as "do not publish"', async (flag) => {
    const db = freshWorld();

    await generate(db, { PublishImmediately: flag }).run;

    expect(rowsOf(db, VERSIONS)).toEqual([]);
  });

  it('refuses a PublishImmediately it cannot read as a boolean, writing nothing', async () => {
    const db = freshWorld();

    const result = await generate(db, { PublishImmediately: 'yes' }).run;

    expect(result).toMatchObject({ Success: false, ResultCode: 'INVALID_PARAMETER' });
    expect(result.Message).toMatch(/PublishImmediately must be true or false; got "yes"/);
    expect(rowsOf(db, FORMS)).toEqual([]);
  });

  it('a refused publish leaves no form and reports PUBLISH_REFUSED — but keeps the Designer\'s blueprint', async () => {
    const db = freshWorld({
      failSaveWhen: (entity, values) => (entity === VERSIONS && values.Status === 'Published' ? 'disk full' : false),
    });
    const { params, run } = generate(db, { PublishImmediately: true });

    const result = await run;

    expect(result).toMatchObject({ Success: false, ResultCode: 'PUBLISH_REFUSED' });
    expect(result.Message).toMatch(/^Forms: Generate Form From Brief: .*disk full/);
    expect(rowsOf(db, FORMS)).toEqual([]);
    expect(output(params, 'Blueprint')).toMatchObject({ name: 'Event RSVP' });
  });

  it('a failed build reports PERSIST_FAILED, naming the Action', async () => {
    const db = freshWorld({ failSaveWhen: (entity) => (entity === 'MJ_BizApps_Forms: Form Pages' ? 'no' : false) });

    const result = await generate(db, {}).run;

    expect(result).toMatchObject({ Success: false, ResultCode: 'PERSIST_FAILED' });
    expect(result.Message).toMatch(/^Forms: Generate Form From Brief: Failed to save FormPage: no/);
  });

  it('with no provider supplied (how agents call it), builds on an ISOLATED provider and releases it — never the global one', async () => {
    const db = freshWorld();
    const released: unknown[] = [];
    Object.assign(db.provider, { ReleaseIndependentInstance: async () => void released.push(db.provider) });
    const global = { CreateIndependentInstance: vi.fn(async () => db.provider), EntityByName: db.provider.EntityByName };
    Metadata.Provider = global as unknown as IMetadataProvider;

    const result = await generate(undefined, { PublishImmediately: true }).run;

    expect(result.Success).toBe(true);
    expect(global.CreateIndependentInstance).toHaveBeenCalledTimes(1);
    expect(rowsOf(db, VERSIONS).map((v) => v.Status)).toEqual(['Published']);
    expect(released).toEqual([db.provider]);
  });

  it('refuses with context when there is no provider and none can be isolated — and never runs the Designer', async () => {
    const db = freshWorld();
    Metadata.Provider = { EntityByName: db.provider.EntityByName } as unknown as IMetadataProvider;

    const result = await generate(undefined, {}).run;

    expect(result).toMatchObject({ Success: false, ResultCode: 'FAILED' });
    expect(result.Message).toMatch(/Forms: Generate Form From Brief: the process provider cannot create an isolated instance/);
    expect(design).not.toHaveBeenCalled();
  });
});

describe('Forms: Generate Form From Brief — refused BEFORE the Designer runs (#303)', () => {
  const anonymous = { ...AUTHOR, IsMagicLinkAnonymous: true } as unknown as UserInfo;
  const scoped = { ...AUTHOR, MagicLinkScope: { ResourceID: 'dist-1' } } as unknown as UserInfo;

  it.each([
    ['an anonymous magic-link session', anonymous],
    ['a magic-link-scoped session', scoped],
  ])('refuses %s with FORBIDDEN, writes nothing and never calls the LLM', async (_label, user) => {
    const db = freshWorld();

    const result = await new GenerateFormFromBriefAction().Run(actionParams(db.provider, user, { Brief: 'x', PublishImmediately: true }));

    expect(result).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
    expect(result.Message).toMatch(/Forms: Generate Form From Brief: .*magic-link/);
    expect(design).not.toHaveBeenCalled();
    expect(rowsOf(db, FORMS)).toEqual([]);
  });

  it('refuses an author without Update on Forms with FORBIDDEN', async () => {
    const db = freshWorld({ updatePermissions: { [FORMS]: false } });

    const result = await generate(db, {}).run;

    expect(result.ResultCode).toBe('FORBIDDEN');
    expect(design).not.toHaveBeenCalled();
  });

  it.each([
    [{ PublishImmediately: 'yes' }, 'INVALID_PARAMETER'],
    [{ Automations: 'not json' }, 'INVALID_ON_SUBMIT_CONFIG'],
    [{ OnSubmitMode: 'Sometimes' }, 'INVALID_ON_SUBMIT_CONFIG'],
  ])('refuses %j as %s without running the Designer', async (inputs, code) => {
    const db = freshWorld();

    const result = await generate(db, inputs).run;

    expect(result.ResultCode).toBe(code);
    expect(design).not.toHaveBeenCalled();
  });

  it('refuses a client-side provider without running the Designer', async () => {
    const client = { EntityByName: freshWorld().provider.EntityByName } as unknown as IMetadataProvider;
    const params = actionParams(undefined, AUTHOR, { Brief: 'x' });
    params.Provider = client;

    const result = await new GenerateFormFromBriefAction().Run(params);

    expect(result).toMatchObject({ Success: false, ResultCode: 'FAILED' });
    expect(result.Message).toMatch(/^Forms: Generate Form From Brief: RunActionParams\.Provider must also implement RunView/);
    expect(design).not.toHaveBeenCalled();
  });
});

describe('Forms: Create Form From Template', () => {
  function fromTemplate(db: FakeProvider, inputs: Record<string, unknown>) {
    return new CreateFormFromTemplateAction().Run(actionParams(db.provider, AUTHOR, inputs));
  }

  it('builds the starter as a Draft by default', async () => {
    const db = freshWorld();

    const result = await fromTemplate(db, { TemplateKey: 'contact', Name: 'Reach us' });

    expect(result.Success).toBe(true);
    expect(rowsOf(db, FORMS).map((f) => [f.Name, f.Status])).toEqual([['Reach us', 'Draft']]);
    expect(rowsOf(db, VERSIONS)).toEqual([]);
  });

  it('stamps the caller as owner unless OwnerUserID names someone — the same rule as Forms.CreateFormFromTemplate', async () => {
    const db = freshWorld();

    await fromTemplate(db, { TemplateKey: 'contact', Name: 'Mine' });
    await fromTemplate(db, { TemplateKey: 'contact', Name: 'Theirs', OwnerUserID: 'owner-9' });

    expect(rowsOf(db, FORMS).map((f) => [f.Name, f.OwnerUserID])).toEqual([
      ['Mine', AUTHOR.ID],
      ['Theirs', 'owner-9'],
    ]);
  });

  it('publishes it in the same transaction when PublishImmediately is true', async () => {
    const db = freshWorld();

    const result = await fromTemplate(db, { TemplateKey: 'nps', PublishImmediately: true });

    expect(result.Message).toMatch(/published as version 1/);
    expect(rowsOf(db, VERSIONS).map((v) => [v.VersionNumber, v.Status])).toEqual([[1, 'Published']]);
  });

  it('refuses an unknown template before touching the database', async () => {
    const db = freshWorld();

    const result = await fromTemplate(db, { TemplateKey: 'nope', PublishImmediately: true });

    expect(result.ResultCode).toBe('UNKNOWN_TEMPLATE');
    // One wording for an unknown key, whoever asks: the engine's (the operation returns the same).
    expect(result.Message).toBe("Unknown template key 'nope'. Known templates: contact, rsvp, nps, lead-capture, application.");
    expect(db.transactions).toEqual([]);
  });

  it('refuses an unreadable PublishImmediately', async () => {
    const db = freshWorld();

    expect((await fromTemplate(db, { TemplateKey: 'contact', PublishImmediately: 'soon' })).ResultCode).toBe('INVALID_PARAMETER');
    expect(rowsOf(db, FORMS)).toEqual([]);
  });

  it('refuses a magic-link session with FORBIDDEN before touching the database', async () => {
    const db = freshWorld();
    const scoped = { ...AUTHOR, MagicLinkScope: { ResourceID: 'dist-1' } } as unknown as UserInfo;

    const result = await new CreateFormFromTemplateAction().Run(
      actionParams(db.provider, scoped, { TemplateKey: 'contact', PublishImmediately: true }),
    );

    expect(result).toMatchObject({ Success: false, ResultCode: 'FORBIDDEN' });
    expect(result.Message).toMatch(/^Forms: Create Form From Template: /);
    expect(rowsOf(db, FORMS)).toEqual([]);
    expect(db.transactions).toEqual([]);
  });

  it('refuses an author without Update on Forms with FORBIDDEN', async () => {
    const db = freshWorld({ updatePermissions: { [FORMS]: false } });

    expect((await fromTemplate(db, { TemplateKey: 'contact' })).ResultCode).toBe('FORBIDDEN');
    expect(rowsOf(db, FORMS)).toEqual([]);
  });
});
