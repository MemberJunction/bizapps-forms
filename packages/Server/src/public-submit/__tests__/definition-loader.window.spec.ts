/**
 * The submit gate's half of the window invariant.
 *
 * `distribution-window.ts` exists because the door and the submit gate must never answer
 * differently about whether a link is open (bizapps-forms#81). That is only true while BOTH
 * actually call it, and nothing else in this package tests the submit gate's window branch —
 * `redeem.service.spec.ts` covers the door alone. So this pins the wiring: the same
 * distribution state that the door refuses is refused here, with the same reason.
 */
import { describe, expect, it } from 'vitest';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

import {
  resolvePublishedDefinition,
  type DefinitionRunViewProvider,
} from '../definition-loader.service';

const ANON_USER = { ID: 'anon-user-id' } as unknown as UserInfo;

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
 * Returns the distribution row for the first read and nothing thereafter, so a test that
 * reaches the version read fails on `no-published-version` rather than passing by accident.
 */
function providerFor(dist: mjBizAppsFormsFormDistributionEntityType): DefinitionRunViewProvider {
  let calls = 0;
  return {
    async RunView<T = unknown>(_params: RunViewParams): Promise<RunViewResult<T>> {
      const rows = calls === 0 ? [dist] : [];
      calls += 1;
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
    );
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses a Closed distribution', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ Status: 'Closed' })),
      'customer-survey',
      ANON_USER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses a switched-off distribution', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ IsActive: false })),
      'customer-survey',
      ANON_USER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses one whose closing date has passed', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ CloseAt: new Date(Date.now() - 60_000) })),
      'customer-survey',
      ANON_USER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  it('refuses one that has not opened yet', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ OpenAt: new Date(Date.now() + 60_000) })),
      'customer-survey',
      ANON_USER,
    );
    expect(out.failure).toBe('distribution-closed');
  });

  // The cap is deliberately NOT this gate's business — a partial save and a knockout consume no
  // slot, so the submit path lets a full link through here and applies the cap in `checkQuotas`
  // on a terminal completion. An Active link at its cap must therefore get PAST the window and
  // fail on the version read instead.
  it('lets a distribution at its response cap past the window', async () => {
    const out = await resolvePublishedDefinition(
      providerFor(distribution({ MaxResponses: 6, ResponseCount: 6 })),
      'customer-survey',
      ANON_USER,
    );
    expect(out.failure).not.toBe('distribution-closed');
    expect(out.failure).toBe('no-published-version');
  });
});
