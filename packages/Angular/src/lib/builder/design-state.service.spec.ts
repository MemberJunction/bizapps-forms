import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ensureOwnStyle` decides which style row a form's Design tab may write to.
 *
 * Two ways it used to get that wrong, both found live on a shared database:
 * - it named the row `${form.Name} theme`, and `FormStyle.Name` is UNIQUE — so the second form
 *   called "Untitled form" (every new form's name) could never open its Design tab;
 * - it treated any `DisplayRank = 0` row assigned to the form as that form's alone, but a template
 *   clone copies `StyleID` verbatim — so restyling a form made from a template restyled the
 *   original and the template with it.
 *
 * The fakes below keep the one database rule that matters (unique style names) and a table of
 * which form points at which style, so both failures reproduce here exactly as they did live.
 */

interface StyleRow {
  ID: string;
  Name: string;
  DisplayRank: number;
  CSSVariables: string;
}

const styleRows = new Map<string, StyleRow>();
/** Form id → StyleID, the only Form column this service reads across forms. */
const formStyles = new Map<string, string | null>();
let formsReadSucceeds = true;
const logged: string[] = [];
let nextId = 0;

class FakeStyle {
  public ID = '';
  public Name = '';
  public Description: string | null = null;
  public CSSVariables = '{}';
  public CustomCSS: string | null = null;
  public LogoURL: string | null = null;
  public DisplayRank = 0;
  public IsActive = true;
  public LatestResult = { CompleteMessage: '' };

  public NewRecord(): void {
    this.ID = '';
  }

  public async Load(id: string): Promise<boolean> {
    const row = styleRows.get(id);
    if (!row) {
      return false;
    }
    Object.assign(this, row);
    return true;
  }

  public async Save(): Promise<boolean> {
    // FormStyle.Name is NVARCHAR(255); MJ's BaseEntity.Validate refuses a longer value before any SQL runs.
    if (this.Name.length > 255) {
      this.LatestResult = { CompleteMessage: `Name cannot be longer than 255 characters (${this.Name.length})` };
      return false;
    }
    const clash = [...styleRows.values()].some((r) => r.Name === this.Name && r.ID !== this.ID);
    if (clash) {
      this.LatestResult = { CompleteMessage: `Violation of UNIQUE KEY constraint 'UQ_FormStyle_Name' (${this.Name})` };
      return false;
    }
    if (!this.ID) {
      this.ID = `style-${++nextId}`;
    }
    styleRows.set(this.ID, { ID: this.ID, Name: this.Name, DisplayRank: this.DisplayRank, CSSVariables: this.CSSVariables });
    return true;
  }
}

class FakeForm {
  public LatestResult = { CompleteMessage: '' };
  constructor(
    public ID: string,
    public Name: string,
    public StyleID: string | null,
  ) {
    formStyles.set(ID, StyleID);
  }

  public async Save(): Promise<boolean> {
    formStyles.set(this.ID, this.StyleID);
    return true;
  }
}

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    public get CurrentUser(): unknown {
      return { ID: 'user-1' };
    }
    public async GetEntityObject(): Promise<FakeStyle> {
      return new FakeStyle();
    }
  }
  class RunView {
    public async RunView(params: { ExtraFilter?: string }): Promise<unknown> {
      if (!formsReadSucceeds) {
        return { Success: false, ErrorMessage: 'simulated read failure', Results: [] };
      }
      const styleId = /StyleID='([^']+)'/.exec(params.ExtraFilter ?? '')?.[1];
      const exceptForm = /ID<>'([^']+)'/.exec(params.ExtraFilter ?? '')?.[1];
      const results = [...formStyles.entries()]
        .filter(([formId, sid]) => sid === styleId && formId !== exceptForm)
        .map(([formId]) => ({ ID: formId }));
      return { Success: true, Results: results };
    }
  }
  return { ...actual, Metadata, RunView, LogError: (message: string) => logged.push(message) };
});

import { DesignStateService } from './design-state.service';
import type { mjBizAppsFormsFormEntity } from '@mj-biz-apps/forms-entities';

const asForm = (form: FakeForm): mjBizAppsFormsFormEntity => form as unknown as mjBizAppsFormsFormEntity;

beforeEach(() => {
  styleRows.clear();
  formStyles.clear();
  formsReadSucceeds = true;
  logged.length = 0;
  nextId = 0;
});

describe('DesignStateService.ensureOwnStyle — style names', () => {
  it('gives two forms with the same name each their own style', async () => {
    const service = new DesignStateService();
    const first = await service.ensureOwnStyle(asForm(new FakeForm('form-a', 'Untitled form', null)));
    const second = await service.ensureOwnStyle(asForm(new FakeForm('form-b', 'Untitled form', null)));

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second?.ID).not.toBe(first?.ID);
    expect(logged).toEqual([]);
  });

  it('fits the style name in the column for a form whose name is already 255 characters', async () => {
    const service = new DesignStateService();
    const longName = 'x'.repeat(255);
    const first = await service.ensureOwnStyle(asForm(new FakeForm('form-a', longName, null)));
    const second = await service.ensureOwnStyle(asForm(new FakeForm('form-b', longName, null)));

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.Name.length).toBeLessThanOrEqual(255);
    expect(second?.Name).not.toBe(first?.Name);
  });

  it('forks the same shared preset for two same-named forms', async () => {
    styleRows.set('preset', { ID: 'preset', Name: 'Ocean', DisplayRank: 3, CSSVariables: '{}' });
    const service = new DesignStateService();
    const first = await service.ensureOwnStyle(asForm(new FakeForm('form-a', 'Signup', 'preset')));
    const second = await service.ensureOwnStyle(asForm(new FakeForm('form-b', 'Signup', 'preset')));

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.ID).not.toBe('preset');
    expect(second?.ID).not.toBe('preset');
    expect(second?.ID).not.toBe(first?.ID);
    expect(styleRows.get('preset')?.Name).toBe('Ocean');
  });
});

describe('DesignStateService.ensureOwnStyle — a per-form style another form also uses', () => {
  it('returns a rank-0 style used only by this form as is', async () => {
    styleRows.set('own', { ID: 'own', Name: 'Mine', DisplayRank: 0, CSSVariables: '{}' });
    const form = new FakeForm('form-a', 'Mine', 'own');

    const style = await new DesignStateService().ensureOwnStyle(asForm(form));

    expect(style?.ID).toBe('own');
    expect(formStyles.get('form-a')).toBe('own');
  });

  it('forks a rank-0 style a template clone also points at, leaving the others on the original', async () => {
    styleRows.set('shared', { ID: 'shared', Name: 'Original theme', DisplayRank: 0, CSSVariables: '{"--mjf-accent":"#123"}' });
    new FakeForm('original', 'Original', 'shared');
    new FakeForm('template', 'Original', 'shared');
    const clone = new FakeForm('clone', 'Original', 'shared');

    const style = await new DesignStateService().ensureOwnStyle(asForm(clone));

    expect(style).toBeDefined();
    expect(style?.ID).not.toBe('shared');
    expect(style?.DisplayRank).toBe(0);
    expect(style?.CSSVariables).toBe('{"--mjf-accent":"#123"}');
    expect(formStyles.get('clone')).toBe(style?.ID);
    expect(formStyles.get('original')).toBe('shared');
    expect(formStyles.get('template')).toBe('shared');
  });

  it('forks rather than edit in place when it cannot tell whether the style is shared', async () => {
    styleRows.set('own', { ID: 'own', Name: 'Mine', DisplayRank: 0, CSSVariables: '{}' });
    formsReadSucceeds = false;

    const style = await new DesignStateService().ensureOwnStyle(asForm(new FakeForm('form-a', 'Mine', 'own')));

    expect(style).toBeDefined();
    expect(style?.ID).not.toBe('own');
    expect(logged.some((m) => m.includes('own') && m.includes('form-a'))).toBe(true);
  });
});
