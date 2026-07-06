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

class FakeEntity {
  ID = '';
  readonly LatestResult = { Message: 'forced failure' };
  constructor(private readonly entityName: string) {}

  NewRecord(): void {
    // Clear any previously-set business fields (none on a fresh instance).
  }

  async Save(): Promise<boolean> {
    if (failOn === this.entityName) {
      return false;
    }
    this.ID = `${this.entityName}#${saved.length + 1}`;
    saved.push({ entity: this.entityName, fields: snapshot(this) });
    return true;
  }
}

/** Snapshot the business fields an instance has accumulated (own enumerable, minus internals). */
function snapshot(entity: FakeEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key === 'entityName' || key === 'LatestResult') {
      continue;
    }
    out[key] = value;
  }
  return out;
}

vi.mock('@memberjunction/core', () => ({
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
