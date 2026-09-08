/**
 * The window rule, split by reason.
 *
 * `distributionWindowClosed` collapses five states into one boolean, which is what the submit
 * gate wants. The door needs to know WHICH — a link that opens next Monday must not be announced
 * as gone (bizapps-forms#118). The split lives here, beside the rule, so the door never grows a
 * second spelling of `OpenAt > now`; the boolean is derived from the reason and cannot disagree.
 */
import { describe, expect, it } from 'vitest';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

import { distributionWindowClosed, distributionWindowRefusal } from '../distribution-window';

const NOW = new Date('2026-09-01T12:00:00Z');
const LATER = new Date('2026-09-08T12:00:00Z');
const EARLIER = new Date('2026-08-25T12:00:00Z');

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

describe('distributionWindowRefusal', () => {
  it('returns undefined for an Active link inside its window', () => {
    expect(distributionWindowRefusal(distribution(), NOW)).toBeUndefined();
  });

  it("returns 'not-yet-open' when OpenAt is still in the future", () => {
    expect(distributionWindowRefusal(distribution({ OpenAt: LATER }), NOW)).toBe('not-yet-open');
  });

  it("returns 'closed' once CloseAt has passed", () => {
    expect(distributionWindowRefusal(distribution({ CloseAt: EARLIER }), NOW)).toBe('closed');
  });

  it("returns 'closed' for a Closed link", () => {
    expect(distributionWindowRefusal(distribution({ Status: 'Closed' }), NOW)).toBe('closed');
  });

  it("returns 'closed' for a Draft link", () => {
    expect(distributionWindowRefusal(distribution({ Status: 'Draft' }), NOW)).toBe('closed');
  });

  it("returns 'closed' for a switched-off link", () => {
    expect(distributionWindowRefusal(distribution({ IsActive: false }), NOW)).toBe('closed');
  });

  // A scheduled link that has also been switched off or closed is not "opening later" — the
  // author has taken it out of service, and that is what the holder must be told.
  it("reports 'closed', not 'not-yet-open', for a scheduled link that is switched off", () => {
    expect(distributionWindowRefusal(distribution({ OpenAt: LATER, IsActive: false }), NOW)).toBe('closed');
  });

  // Closes before it opens: nothing to wait for, so it must not be announced as "opens later".
  it("reports 'closed' when CloseAt has already passed even though OpenAt is still ahead", () => {
    expect(distributionWindowRefusal(distribution({ OpenAt: LATER, CloseAt: EARLIER }), NOW)).toBe('closed');
  });

  it('opens exactly at OpenAt', () => {
    expect(distributionWindowRefusal(distribution({ OpenAt: NOW }), NOW)).toBeUndefined();
  });
});

describe('distributionWindowClosed agrees with the reason on every state', () => {
  const cases: Array<[string, Partial<mjBizAppsFormsFormDistributionEntityType>]> = [
    ['open', {}],
    ['not yet open', { OpenAt: LATER }],
    ['past CloseAt', { CloseAt: EARLIER }],
    ['Closed', { Status: 'Closed' }],
    ['Draft', { Status: 'Draft' }],
    ['switched off', { IsActive: false }],
  ];
  for (const [label, overrides] of cases) {
    it(`for a link that is ${label}`, () => {
      const dist = distribution(overrides);
      expect(distributionWindowClosed(dist, NOW)).toBe(distributionWindowRefusal(dist, NOW) !== undefined);
    });
  }
});
