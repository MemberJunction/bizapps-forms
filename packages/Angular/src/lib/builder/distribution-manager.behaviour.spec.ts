/**
 * `DistributionManagerComponent` exercised as a class.
 *
 * It uses field `inject()`, which needs an injection context — not a TestBed. Angular's own
 * `runInInjectionContext` over an `Injector.create(...)` of stub providers is enough, and was
 * verified by spike in this node environment. Every provider is a narrow fake: the service
 * records calls and returns what the test says; the sanitizer passes strings through; the
 * change detector is inert.
 */
import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { describe, it, expect } from 'vitest';
import type {
  mjBizAppsFormsFormDistributionEntity,
  mjBizAppsFormsFormDistributionEntityType,
} from '@mj-biz-apps/forms-entities';
import { DistributionManagerComponent } from './distribution-manager.component';
import { DistributionService, type MutationOutcome } from './distribution.service';
import type { ClaimsResult, ShareLinkClaim } from './distribution-claims';

/**
 * The part of a link the component reads.
 *
 * PICKED from the generated entity type, never re-declared. A hand-copied version of this carried a
 * `'Paused'` status the column's CHECK constraint does not allow — an impossible state the tests
 * could have been written against — and would have kept compiling after CodeGen widened or
 * narrowed the real union.
 */
type LinkShape = Pick<
  mjBizAppsFormsFormDistributionEntityType,
  | 'ID'
  | 'Name'
  | 'Slug'
  | 'Status'
  | 'IsActive'
  | 'PublicLinkToken'
  | 'MagicLinkInviteID'
  | 'OpenAt'
  | 'CloseAt'
  | 'MaxResponses'
  | 'ResponseCount'
>;

function link(overrides: Partial<LinkShape> = {}): mjBizAppsFormsFormDistributionEntity {
  const base: LinkShape = {
    ID: 'dist-1',
    Name: 'Summer survey',
    Slug: 'summer-survey',
    Status: 'Active',
    IsActive: true,
    PublicLinkToken: 'mj_ml_live',
    MagicLinkInviteID: 'invite-live',
    OpenAt: null,
    CloseAt: null,
    MaxResponses: null,
    ResponseCount: 0,
    ...overrides,
  };
  return base as unknown as mjBizAppsFormsFormDistributionEntity;
}

type ServiceSurface = Pick<
  DistributionService,
  'list' | 'claims' | 'open' | 'close' | 'issueLink' | 'reissueLink' | 'setSchedule' | 'setMaxResponses'
>;

/**
 * A service double that records which method ran and serves a scripted sequence of list() results.
 * `initial` is what the component starts with; `reloads` is what each subsequent `list()` returns,
 * the last entry repeating — so a test can make the re-read disagree with the seed.
 */
interface ServiceDouble {
  calls: string[];
  /** Form ids `claims()` was asked about; kept apart so the mutation call orders stay exact. */
  claimAsks: string[];
  initial: mjBizAppsFormsFormDistributionEntity[];
  reloads: mjBizAppsFormsFormDistributionEntity[][];
  /** What `claims()` answers; swap it to script a slow, failing or reordered check. */
  claimsImpl: (formId: string) => Promise<ClaimsResult>;
  service: ServiceSurface;
}

function serviceDouble(
  initial: mjBizAppsFormsFormDistributionEntity[],
  outcome: MutationOutcome = { ok: true },
): ServiceDouble {
  const calls: string[] = [];
  const claimAsks: string[] = [];
  const listResults: mjBizAppsFormsFormDistributionEntity[][] = [initial];
  const record = (name: string) => async () => {
    calls.push(name);
    return outcome;
  };
  const double: ServiceDouble = {
    calls,
    claimAsks,
    initial,
    reloads: listResults,
    claimsImpl: async () => ({ ok: true, claims: [], failures: [] }),
    service: {
      claims: (formId: string) => {
        claimAsks.push(formId);
        return double.claimsImpl(formId);
      },
      list: async () => {
        calls.push('list');
        const nth = calls.filter((c) => c === 'list').length - 1;
        return { ok: true, items: listResults[Math.min(nth, listResults.length - 1)] };
      },
      open: record('open'),
      close: record('close'),
      issueLink: record('issueLink'),
      reissueLink: record('reissueLink'),
      setSchedule: record('setSchedule'),
      setMaxResponses: record('setMaxResponses'),
    },
  };
  return double;
}

/** The protected surface a test drives. Kept to the members these tests touch. */
interface Driver {
  links: mjBizAppsFormsFormDistributionEntity[];
  selectedId: string | null;
  busy: boolean;
  actionError: string | null;
  loadError: string | null;
  claimCheckNote: string | null;
  formId: string;
  reload(quiet?: boolean): Promise<void>;
  ngOnInit(): Promise<void>;
  claimsFor(link: mjBizAppsFormsFormDistributionEntity): readonly ShareLinkClaim[];
  applyFix(): Promise<void>;
  toggleOpen(): Promise<void>;
}

function construct(double: ServiceDouble): Driver {
  const injector = Injector.create({
    providers: [
      { provide: DistributionService, useValue: double.service },
      {
        provide: DomSanitizer,
        useValue: { bypassSecurityTrustUrl: (v: string) => v, bypassSecurityTrustHtml: (v: string) => v },
      },
      { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
    ],
  });
  const c = runInInjectionContext(injector, () => new DistributionManagerComponent());
  const d = c as unknown as Driver;
  d.formId = 'form-1';
  d.links = double.initial;
  d.selectedId = d.links[0]?.ID ?? null;
  return d;
}

describe('DistributionManagerComponent — the fix button', () => {
  it("'paused' calls open, and re-reads the record afterwards", async () => {
    const double = serviceDouble([
      link({ Status: 'Closed', IsActive: false, PublicLinkToken: null, MagicLinkInviteID: null }),
    ]);
    const d = construct(double);
    await d.applyFix();
    expect(double.calls).toEqual(['open', 'list']);
  });

  it("'pending' calls issueLink, and re-reads the record afterwards", async () => {
    const double = serviceDouble([link({ PublicLinkToken: null, MagicLinkInviteID: null })]);
    const d = construct(double);
    await d.applyFix();
    expect(double.calls).toEqual(['issueLink', 'list']);
  });
});

describe('DistributionManagerComponent — a real save error is not overwritten with a diagnosis', () => {
  it('keeps the save error when issuing fails, instead of claiming magic links are switched off', async () => {
    // The save was refused — a slug conflict, say. The re-read still shows no token, and the
    // "still unissued" warning used to replace the real reason with "Public links are not
    // switched on for this server", sending the author to audit config that is correct.
    const unissued = link({ PublicLinkToken: null, MagicLinkInviteID: null });
    const double = serviceDouble([unissued], { ok: false, error: 'Could not issue a link. Slug already in use.' });
    const d = construct(double);
    await d.applyFix();
    expect(d.actionError).toBe('Could not issue a link. Slug already in use.');
    expect(d.actionError).not.toMatch(/not switched on/);
  });

  it('keeps the save error when closing fails, instead of claiming the withdrawal is unconfirmed', async () => {
    // Reachable only when the re-read disagrees with the refused save — another tab paused the
    // link between the two round-trips, so the reload shows paused-with-token while actionError
    // holds the real refusal. Rare, but the guard is the same one, and it must not be the one
    // helper left able to overwrite a real error.
    const live = link();
    const double = serviceDouble([live], { ok: false, error: 'Could not pause this share link. Row locked.' });
    double.reloads[0] = [link({ Status: 'Closed', IsActive: false, PublicLinkToken: 'mj_ml_live' })];
    const d = construct(double);
    await d.toggleOpen();
    expect(d.actionError).toBe('Could not pause this share link. Row locked.');
  });

  it('still warns when the save SUCCEEDED but the token did not arrive', async () => {
    // The guard must not become silence: with no save error, the diagnosis is still owed.
    const unissued = link({ PublicLinkToken: null, MagicLinkInviteID: null });
    const double = serviceDouble([unissued]);
    const d = construct(double);
    await d.applyFix();
    expect(d.actionError).toMatch(/not switched on/);
  });
});

const theClaim: ShareLinkClaim = {
  appName: 'Caliber',
  slug: 'summer-survey',
  ownerLabel: 'Intake step',
  respondentUrl: 'https://caliber.example/intake',
};

/** Let the fire-and-forget claims check settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DistributionManagerComponent — share-link claims', () => {
  it('asks for the claims of this form after loading its links', async () => {
    const double = serviceDouble([link()]);
    const d = construct(double);
    await d.ngOnInit();
    await flush();
    expect(double.claimAsks).toEqual(['form-1']);
  });

  it('returns the claim for a claimed slug and nothing for the others', async () => {
    const double = serviceDouble([link(), link({ ID: 'dist-2', Slug: 'other' })]);
    double.claimsImpl = async () => ({ ok: true, claims: [theClaim], failures: [] });
    const d = construct(double);
    await d.reload();
    await flush();
    expect(d.claimsFor(double.initial[0])).toEqual([theClaim]);
    expect(d.claimsFor(double.initial[1])).toEqual([]);
  });

  it('hands every unclaimed link the same empty array, so change detection sees no new value', async () => {
    const double = serviceDouble([link(), link({ ID: 'dist-2', Slug: 'other' })]);
    const d = construct(double);
    await d.reload();
    await flush();
    expect(d.claimsFor(double.initial[0])).toBe(d.claimsFor(double.initial[1]));
  });

  it('reports a failed check in claimCheckNote and leaves the links rendered', async () => {
    const double = serviceDouble([link()]);
    double.claimsImpl = async () => ({ ok: false, error: 'boom' });
    const d = construct(double);
    await d.reload();
    await flush();
    expect(d.claimCheckNote).toContain('boom');
    expect(d.links).toHaveLength(1);
    expect(d.claimsFor(double.initial[0])).toEqual([]);
  });

  it('never turns a claims failure into a links load error', async () => {
    const double = serviceDouble([link()]);
    double.claimsImpl = async () => ({ ok: false, error: 'boom' });
    const d = construct(double);
    await d.reload();
    await flush();
    expect(d.loadError).toBeNull();
  });

  it('ignores a claims answer that arrives after a newer reload', async () => {
    const double = serviceDouble([link()]);
    const resolvers: Array<(r: ClaimsResult) => void> = [];
    double.claimsImpl = () => new Promise<ClaimsResult>((resolve) => resolvers.push(resolve));
    const d = construct(double);
    await d.reload();
    await d.reload(true);
    expect(resolvers).toHaveLength(2);
    resolvers[1]({ ok: true, claims: [], failures: [] });
    await flush();
    resolvers[0]({ ok: true, claims: [theClaim], failures: [] });
    await flush();
    expect(d.claimsFor(double.initial[0])).toEqual([]);
  });
});
