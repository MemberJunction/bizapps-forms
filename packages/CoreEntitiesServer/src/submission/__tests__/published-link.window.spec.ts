/**
 * The submit gate's half of the window invariant.
 *
 * `distribution-window.ts` exists because the door and the submit gate must never answer
 * differently about whether a link is open (bizapps-forms#81). That is only true while BOTH
 * actually call it, and nothing else in this package tests the submit gate's window branch —
 * `redeem.service.spec.ts` covers the door alone. So this pins the wiring: the same
 * distribution state that the door refuses is refused here, with the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

const logError = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (...args: unknown[]) => logError(...args),
}));
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

import {
  publishedVersionFilter,
  resolvePublishedDefinition,
  type DefinitionRunViewProvider,
} from '../published-link.js';

const ANON_USER = { ID: 'anon-user-id' } as unknown as UserInfo;
/** The elevated reader of the form's own `Status` — the respondent role has no grant on Forms. */
const FORM_READER = { ID: 'system-user-id' } as unknown as UserInfo;

function distribution(
  overrides: Partial<mjBizAppsFormsFormDistributionEntityType> = {},
): mjBizAppsFormsFormDistributionEntityType {
  return {
    ID: 'dist-1',
    FormID: 'form-1',
    Name: 'Test Distribution',
    Slug: 'customer-survey',
    ChannelType: 'PublicLink',
    Status: 'Active',
    OpenAt: null,
    CloseAt: null,
    MaxResponses: null,
    ResponseCount: 0,
    CaptchaRequired: false,
    IsActive: true,
    PublicLinkToken: 'raw-public-token',
    ...overrides,
  } as mjBizAppsFormsFormDistributionEntityType;
}

/**
 * Serves the distribution row and the form's `Status`, and NO version, so a test that reaches the
 * version read fails on `no-published-version` rather than passing by accident. Every read's params
 * and user are kept so a test can look at what each read asked for, and as whom.
 */
function providerFor(
  dist: mjBizAppsFormsFormDistributionEntityType,
  seen: RunViewParams[] = [],
  options: { formStatus?: string; formReadFails?: boolean; readers?: (UserInfo | undefined)[] } = {},
): DefinitionRunViewProvider {
  return {
    async RunView<T = unknown>(params: RunViewParams, user?: UserInfo): Promise<RunViewResult<T>> {
      seen.push(params);
      options.readers?.push(user);
      if (options.formReadFails && params.EntityName === 'MJ_BizApps_Forms: Forms') {
        return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'login timeout' } as RunViewResult<T>;
      }
      const rows =
        params.EntityName === 'MJ_BizApps_Forms: Form Distributions'
          ? [dist]
          : params.EntityName === 'MJ_BizApps_Forms: Forms'
            ? [{ ID: dist.FormID, Status: options.formStatus ?? 'Published' }]
            : [];
      return {
        Success: true,
        Results: rows as unknown as T[],
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 0,
        ErrorMessage: '',
      } as RunViewResult<T>;
    },
  };
}

describe('resolvePublishedDefinition — the distribution window', () => {
  // Draft is this column's DEFAULT, and the minter never un-mints, so a link that was Active
  // once and is set back to Draft still carries a token. The submit gate has to agree with the
  // door about it, or a held session keeps writing to a link the author has taken out of service.
  it('refuses a Draft distribution', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ Status: 'Draft' })),
      'customer-survey',
      ANON_USER,
      FORM_READER,
    );
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses a Closed distribution', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ Status: 'Closed' })),
      'customer-survey',
      ANON_USER,
      FORM_READER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses a switched-off distribution', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ IsActive: false })),
      'customer-survey',
      ANON_USER,
      FORM_READER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses one whose closing date has passed', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ CloseAt: new Date(Date.now() - 60_000) })),
      'customer-survey',
      ANON_USER,
      FORM_READER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses one that has not opened yet', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ OpenAt: new Date(Date.now() + 60_000) })),
      'customer-survey',
      ANON_USER,
      FORM_READER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  // The cap is deliberately NOT this gate's business — a partial save and a knockout consume no
  // slot, so the submit path lets a full link through here and applies the cap (the atomic slot
  // UPDATE) on a terminal completion. An Active link at its cap must therefore get PAST the window and
  // fail on the version read instead.
  it('lets a distribution at its response cap past the window', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ MaxResponses: 6, ResponseCount: 6 })),
      'customer-survey',
      ANON_USER,
      FORM_READER,
    );
    expect(out.failure).not.toBe('distribution-closed');
    expect(out.failure).toBe('no-published-version');
  });
});

describe('resolvePublishedDefinition — the published version', () => {
  // The door refuses a link whose form has no published version (bizapps-forms#118) with an
  // existence read built from the same filter. This pins that the gate really asks with that
  // filter, so "published" cannot mean one thing at the door and another here.
  it('asks for the version with the exported publishedVersionFilter', async () => {
    const seen: RunViewParams[] = [];
    await resolvePublishedDefinition(providerFor(distribution(), seen), 'customer-survey', ANON_USER, FORM_READER);
    const versionRead = seen.find((params) => params.EntityName === 'MJ_BizApps_Forms: Form Versions');
    expect(versionRead?.ExtraFilter).toBe(publishedVersionFilter('form-1'));
  });

  it('publishedVersionFilter names the form and the Published status', () => {
    expect(publishedVersionFilter('form-1')).toBe(`FormID='form-1' AND Status='Published'`);
  });
});

describe('resolvePublishedDefinition — the form itself must be Published (#303 Task 8)', () => {
  // The link and version checks say nothing about the FORM: archiving sets `Form.Status = 'Closed'`,
  // and a link row written by something that never went through the archive rule still reads Active.
  it('refuses a form that is not Published, before reading its version', async () => {
    const seen: RunViewParams[] = [];
    for (const status of ['Closed', 'Draft']) {
      const out = await resolvePublishedDefinition(
        providerFor(distribution(), seen, { formStatus: status }),
        'customer-survey',
        ANON_USER,
        FORM_READER,
      );
      expect(out.ok).toBe(false);
      expect(out.failure).toBe('form-not-published');
    }
    expect(seen.some((params) => params.EntityName === 'MJ_BizApps_Forms: Form Versions')).toBe(false);
  });

  // #302: the respondent role no longer holds any read on Form Versions, so the raw snapshot (the
  // scoring table, every ending's redirect, the knockout conditions) is unreachable through the
  // generic GraphQL resolvers. The version is read as the elevated reader, and only AFTER the
  // distribution read — the one still made as the respondent, so its row filter binds the session
  // to its own link — has named the form.
  it('reads the distribution as the respondent, and the form Status and the version as the elevated reader', async () => {
    const seen: RunViewParams[] = [];
    const readers: (UserInfo | undefined)[] = [];
    await resolvePublishedDefinition(providerFor(distribution(), seen, { readers }), 'customer-survey', ANON_USER, FORM_READER);
    const byEntity = seen.map((params, index) => [params.EntityName, readers[index]] as const);
    expect(byEntity).toEqual([
      ['MJ_BizApps_Forms: Form Distributions', ANON_USER],
      ['MJ_BizApps_Forms: Forms', FORM_READER],
      ['MJ_BizApps_Forms: Form Versions', FORM_READER],
    ]);
  });

  it('never reads a version when the respondent cannot read the distribution (the scope binding)', async () => {
    const seen: RunViewParams[] = [];
    const provider: DefinitionRunViewProvider = {
      async RunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        seen.push(params);
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
      },
    };
    const out = await resolvePublishedDefinition(provider, 'someone-elses-link', ANON_USER, FORM_READER);
    expect(out.failure).toBe('distribution-not-found');
    expect(seen.map((params) => params.EntityName)).toEqual(['MJ_BizApps_Forms: Form Distributions']);
  });
});

describe('resolvePublishedDefinition — a version read that fails', () => {
  it('logs the failure with the form and the slug instead of reporting it silently as unpublished', async () => {
    logError.mockClear();
    const base = providerFor(distribution());
    const provider: DefinitionRunViewProvider = {
      async RunView<T = unknown>(params: RunViewParams, user?: UserInfo): Promise<RunViewResult<T>> {
        if (params.EntityName === 'MJ_BizApps_Forms: Form Versions') {
          return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'deadlock victim' } as RunViewResult<T>;
        }
        return base.RunView<T>(params, user);
      },
    };
    const out = await resolvePublishedDefinition(provider, 'customer-survey', ANON_USER, FORM_READER);
    expect(out.ok).toBe(false);
    const line = String(logError.mock.calls.at(-1)?.[0]);
    expect(line).toContain('form-1');
    expect(line).toContain('customer-survey');
    expect(line).toContain('deadlock victim');
  });
});

describe('resolvePublishedDefinition — a form whose Status cannot be read (review minor 5)', () => {
  it('says it could not read the form, logs why with the form and slug, and never calls it unpublished', async () => {
    logError.mockClear();
    const out = await resolvePublishedDefinition(
      providerFor(distribution(), [], { formReadFails: true }),
      'customer-survey',
      ANON_USER,
      FORM_READER,
    );
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('form-unreadable');
    const line = String(logError.mock.calls.at(-1)?.[0]);
    expect(line).toContain('form-1');
    expect(line).toContain('login timeout');
  });
});
