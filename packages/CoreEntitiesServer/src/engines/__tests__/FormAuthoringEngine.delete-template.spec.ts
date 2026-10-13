/**
 * `FormAuthoringEngine.DeleteTemplate` against the emulated database (`forms-world.ts`), with the
 * real `FormEntityServer` over every Form row.
 *
 * Replaces the browser's `shared/template-deletion.ts` (fix round 1 of #303 Task 10a, controller
 * ruling), keeping its rules: only a template, never one with responses, versions or share links,
 * children deleted in FK order — and the whole walk as ONE unit of work, so a delete that fails
 * part-way leaves the template exactly as it was.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHOR,
  AUTOMATIONS,
  BINDINGS,
  DISTRIBUTIONS,
  FORMS,
  OPTIONS,
  PAGES,
  QUESTIONS,
  SCREENS,
  VERSIONS,
  automationRow,
  bindingRow,
  distributionRow,
  draftTables,
  formRow,
  formsWorld,
  rowsOf,
  screenRow,
  versionRow,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeProviderConfig, FakeRow } from '../../testing/index.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: (m: string) => logged.push(m), LogStatus: (m: string) => logged.push(m) };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { WriteThroughEntityBase } = await import('../../testing/write-through-entity.js');
  return {
    ...actual,
    mjBizAppsFormsFormEntity: WriteThroughEntityBase,
    mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase,
  };
});

const { FormAuthoringEngine, FormAuthoringError } = await (async () => {
  const engine = await import('../FormAuthoringEngine.js');
  const errors = await import('../authoring-errors.js');
  return { FormAuthoringEngine: engine.FormAuthoringEngine, FormAuthoringError: errors.FormAuthoringError };
})();
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;
const RESPONSES = 'MJ_BizApps_Forms: Form Responses';

/** A template (form-1) with a page, two questions, two options, a screen, a step and its binding — and another form's rows. */
function templateTables(form: Partial<FakeRow> = {}): Record<string, FakeRow[]> {
  const base = draftTables();
  return {
    ...base,
    [FORMS]: [formRow({ IsTemplate: true, ...form }), formRow({ ID: 'form-2', Name: 'Other' })],
    [SCREENS]: [screenRow({ ID: 's1' })],
    [AUTOMATIONS]: [automationRow({ ID: 'a1', BindingID: 'b1', TargetType: 'EntityBinding' })],
    [BINDINGS]: [bindingRow({ ID: 'b1' })],
    [VERSIONS]: [],
    [DISTRIBUTIONS]: [],
    [RESPONSES]: [],
  };
}

function world(tables: Record<string, FakeRow[]>, config: Partial<FakeProviderConfig> = {}) {
  return formsWorld(SUBCLASSES, tables, config);
}

const ids = (db: ReturnType<typeof world>, entity: string) => rowsOf(db, entity).map((r) => r.ID);

beforeEach(() => {
  logged.length = 0;
});

describe('DeleteTemplate', () => {
  it('deletes the template and everything under it, children first, in one unit of work', async () => {
    const db = world(templateTables());

    const result = await FormAuthoringEngine.Instance.DeleteTemplate('form-1', db.provider, AUTHOR);

    expect(result).toEqual({
      templateFormId: 'form-1',
      pageCount: 1,
      questionCount: 2,
      optionCount: 2,
      screenCount: 1,
      automationCount: 1,
      bindingCount: 1,
    });
    expect(ids(db, FORMS)).toEqual(['form-2']);
    for (const entity of [PAGES, QUESTIONS, OPTIONS, SCREENS, AUTOMATIONS, BINDINGS]) {
      expect(ids(db, entity), entity).toEqual([]);
    }
    // Options before their questions; automations before the binding they run; the form last.
    const order = db.deleted.map((d) => d.entityName);
    expect(order.indexOf(OPTIONS)).toBeLessThan(order.indexOf(QUESTIONS));
    expect(order.indexOf(AUTOMATIONS)).toBeLessThan(order.indexOf(BINDINGS));
    expect(order.at(-1)).toBe(FORMS);
    expect(db.transactions[0]).toBe('begin');
    expect(db.transactions.at(-1)).toBe('commit');
  });

  it('refuses a working form — forms are archived, never deleted — and writes nothing', async () => {
    const db = world(templateTables({ IsTemplate: false }));

    await expect(FormAuthoringEngine.Instance.DeleteTemplate('form-1', db.provider, AUTHOR)).rejects.toThrow(
      '"Intake" is a form, not a template, and forms are archived rather than deleted.',
    );
    expect(db.deleted).toEqual([]);
  });

  it.each([
    ['responses', RESPONSES, { ID: 'r1', FormID: 'form-1' }, 'This template has 1 response(s) attached and cannot be deleted.'],
    ['versions', VERSIONS, versionRow('v1', 1, 'Draft'), 'This template has 1 published version(s) attached and cannot be deleted.'],
    ['share links', DISTRIBUTIONS, distributionRow({ ID: 'd1' }), 'This template has 1 distribution link(s) attached and cannot be deleted.'],
  ])('refuses a template with %s attached, before deleting anything', async (_label, entity, row, message) => {
    const tables = templateTables();
    tables[entity] = [row as FakeRow];
    const db = world(tables);

    await expect(FormAuthoringEngine.Instance.DeleteTemplate('form-1', db.provider, AUTHOR)).rejects.toThrow(message);
    expect(db.deleted).toEqual([]);
  });

  it('leaves the template whole when a delete part-way through fails', async () => {
    const db = world(templateTables(), {
      failDeleteWhen: (entity) => (entity === SCREENS ? 'The DELETE statement conflicted with a REFERENCE constraint.' : false),
    });

    const failure = FormAuthoringEngine.Instance.DeleteTemplate('form-1', db.provider, AUTHOR);

    await expect(failure).rejects.toBeInstanceOf(FormAuthoringError);
    await expect(failure).rejects.toThrow(/Nothing was deleted/);
    expect(ids(db, FORMS)).toEqual(['form-1', 'form-2']);
    expect(ids(db, QUESTIONS)).toEqual(['q1', 'q2']);
    expect(ids(db, OPTIONS).sort()).toEqual(['o1', 'o2']);
    expect(db.transactions.at(-1)).toBe('rollback');
  });

  it('refuses a template that does not exist', async () => {
    const db = world(templateTables());
    await expect(FormAuthoringEngine.Instance.DeleteTemplate('nope', db.provider, AUTHOR)).rejects.toThrow(
      'Form nope does not exist, so it cannot be deleted.',
    );
  });
});
