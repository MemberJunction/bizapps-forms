/**
 * The one authorization rule every Forms AUTHORING operation applies (spec #303 §2): a signed-in
 * author who may update forms — never an anonymous or magic-link session, whatever its roles.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
  authorizeDistributionAuthoring,
  authorizeFormAuthoring,
  distributionAuthoringRefusal,
  formAuthoringRefusal,
  refuseFormAuthoring,
} from '../form-authoring-authorization.js';
import { makeFakeProvider } from '../../testing/index.js';

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogStatus: (m: string) => logged.push(m), LogError: (m: string) => logged.push(m) };
});

const FORMS = 'MJ_BizApps_Forms: Forms';
const DISTRIBUTIONS = 'MJ_BizApps_Forms: Form Distributions';

function user(overrides: Partial<Record<'IsMagicLinkAnonymous' | 'MagicLinkScope', unknown>> = {}): UserInfo {
  return { ID: 'author-1', Name: 'Author', IsMagicLinkAnonymous: false, MagicLinkScope: undefined, ...overrides } as unknown as UserInfo;
}

const mayUpdate = makeFakeProvider({ updatePermissions: { [FORMS]: true } }).provider;
const mayNot = makeFakeProvider({ updatePermissions: { [FORMS]: false } }).provider;

describe('formAuthoringRefusal', () => {
  it('admits a signed-in author with Update on Forms', () => {
    expect(formAuthoringRefusal(user(), mayUpdate)).toBeNull();
  });

  it('refuses an anonymous magic-link session, even one whose roles would allow it', () => {
    expect(formAuthoringRefusal(user({ IsMagicLinkAnonymous: true }), mayUpdate)).toMatch(/anonymous/);
  });

  it('refuses any magic-link-scoped session — a respondent link is not an authoring credential', () => {
    expect(formAuthoringRefusal(user({ MagicLinkScope: { ResourceID: 'dist-1' } }), mayUpdate)).toMatch(/magic-link/);
  });

  it('refuses a user without Update on Forms', () => {
    expect(formAuthoringRefusal(user(), mayNot)).toMatch(/Update permission on MJ_BizApps_Forms: Forms/);
  });

  it('fails closed when the Forms entity is not in the metadata', () => {
    const empty = { EntityByName: () => undefined } as unknown as IMetadataProvider;
    expect(formAuthoringRefusal(user(), empty)).toMatch(/not in this host's metadata/);
  });

  it('fails closed when the permission lookup throws, carrying the reason', () => {
    const broken = {
      EntityByName: () => {
        throw new Error('metadata not loaded');
      },
    } as unknown as IMetadataProvider;
    expect(formAuthoringRefusal(user(), broken)).toMatch(/metadata not loaded/);
  });

  it('refuses no user at all', () => {
    expect(formAuthoringRefusal(undefined, mayUpdate)).toMatch(/no user/);
  });
});

describe('authorizeFormAuthoring', () => {
  const original = (() => {
    try {
      return Metadata.Provider;
    } catch {
      return undefined;
    }
  })();
  afterEach(() => {
    Metadata.Provider = original as IMetadataProvider;
    logged.length = 0;
  });

  it('reads permissions from the process metadata, since Authorize receives no provider', () => {
    Metadata.Provider = mayUpdate;
    expect(authorizeFormAuthoring('Forms.PublishForm', user())).toBe(true);
    Metadata.Provider = mayNot;
    expect(authorizeFormAuthoring('Forms.PublishForm', user())).toBe(false);
  });

  it('logs why it refused, naming the operation and the user', () => {
    expect(authorizeFormAuthoring('Forms.PublishForm', user({ IsMagicLinkAnonymous: true }), mayUpdate)).toBe(false);
    expect(logged.join('\n')).toMatch(/Forms\.PublishForm.*author-1.*anonymous/);
  });

  it('refuseFormAuthoring returns the reason for a caller that reports it itself, and logs it once', () => {
    expect(refuseFormAuthoring('Forms: Generate Form From Brief', user(), mayUpdate)).toBeNull();
    expect(logged).toEqual([]);
    expect(refuseFormAuthoring('Forms: Generate Form From Brief', user(), mayNot)).toMatch(/lacks Update permission/);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/Forms: Generate Form From Brief.*author-1/);
  });
});

/**
 * The share-link operations (#303 Task 6): the authoring rule, plus the rights on Form Distributions
 * the verb needs. The claims query this replaced required Update on Form Distributions; issuing a
 * link also creates one.
 */
describe('distributionAuthoringRefusal', () => {
  const rights = (forms: boolean, create: boolean, update: boolean) =>
    makeFakeProvider({
      updatePermissions: { [FORMS]: forms, [DISTRIBUTIONS]: update },
      createPermissions: { [DISTRIBUTIONS]: create },
    }).provider;

  it('admits an author with Update on Forms and the share-link rights asked for', () => {
    expect(distributionAuthoringRefusal(user(), rights(true, true, true), ['CanCreate', 'CanUpdate'])).toBeNull();
    expect(distributionAuthoringRefusal(user(), rights(true, false, true), ['CanUpdate'])).toBeNull();
  });

  it('applies the authoring rule first: a magic-link session is refused whatever its share-link rights', () => {
    expect(
      distributionAuthoringRefusal(user({ MagicLinkScope: { ResourceID: 'dist-1' } }), rights(true, true, true), ['CanUpdate']),
    ).toMatch(/magic-link/);
    expect(distributionAuthoringRefusal(user({ IsMagicLinkAnonymous: true }), rights(true, true, true), ['CanUpdate'])).toMatch(
      /anonymous/,
    );
  });

  it('refuses an author without Update on Forms, whatever their share-link rights', () => {
    expect(distributionAuthoringRefusal(user(), rights(false, true, true), ['CanUpdate'])).toMatch(
      /Update permission on MJ_BizApps_Forms: Forms/,
    );
  });

  it('refuses an author without Update on Form Distributions', () => {
    expect(distributionAuthoringRefusal(user(), rights(true, true, false), ['CanUpdate'])).toMatch(
      /Update permission on MJ_BizApps_Forms: Form Distributions/,
    );
  });

  it('refuses an author without Create on Form Distributions when the verb creates one', () => {
    expect(distributionAuthoringRefusal(user(), rights(true, false, true), ['CanCreate', 'CanUpdate'])).toMatch(
      /Create permission on MJ_BizApps_Forms: Form Distributions/,
    );
  });

  it('fails closed when Form Distributions is not in the metadata', () => {
    const formsOnly = {
      EntityByName: (name: string) => (name === FORMS ? rights(true, true, true).EntityByName(FORMS) : undefined),
    } as unknown as IMetadataProvider;
    expect(distributionAuthoringRefusal(user(), formsOnly, ['CanUpdate'])).toMatch(/Form Distributions is not in this host's metadata/);
  });

  it('authorizeDistributionAuthoring logs the refusal with the operation and the user, and answers yes/no', () => {
    logged.length = 0;
    expect(authorizeDistributionAuthoring('Forms.OpenDistribution', user(), ['CanUpdate'], rights(true, true, true))).toBe(true);
    expect(logged).toEqual([]);
    expect(authorizeDistributionAuthoring('Forms.OpenDistribution', user(), ['CanUpdate'], rights(true, true, false))).toBe(false);
    expect(logged.join('\n')).toMatch(/Forms\.OpenDistribution.*author-1.*Form Distributions/);
  });
});
