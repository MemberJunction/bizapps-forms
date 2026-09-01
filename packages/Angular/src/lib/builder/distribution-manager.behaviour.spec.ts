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
import type { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { DistributionManagerComponent } from './distribution-manager.component';
import { DistributionService, type MutationOutcome } from './distribution.service';

/** The part of a link the component reads. */
interface LinkShape {
  ID: string;
  Name: string;
  Slug: string;
  Status: 'Draft' | 'Active' | 'Paused' | 'Closed';
  IsActive: boolean;
  PublicLinkToken: string | null;
  MagicLinkInviteID: string | null;
  OpenAt: Date | null;
  CloseAt: Date | null;
  MaxResponses: number | null;
  ResponseCount: number;
}

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
  'list' | 'open' | 'close' | 'issueLink' | 'reissueLink' | 'setSchedule' | 'setMaxResponses'
>;

/**
 * A service double that records which method ran and serves a scripted sequence of list() results.
 * `initial` is what the component starts with; `reloads` is what each subsequent `list()` returns,
 * the last entry repeating — so a test can make the re-read disagree with the seed.
 */
interface ServiceDouble {
  calls: string[];
  initial: mjBizAppsFormsFormDistributionEntity[];
  reloads: mjBizAppsFormsFormDistributionEntity[][];
  service: ServiceSurface;
}

function serviceDouble(
  initial: mjBizAppsFormsFormDistributionEntity[],
  outcome: MutationOutcome = { ok: true },
): ServiceDouble {
  const calls: string[] = [];
  const listResults: mjBizAppsFormsFormDistributionEntity[][] = [initial];
  const record = (name: string) => async () => {
    calls.push(name);
    return outcome;
  };
  return {
    calls,
    initial,
    reloads: listResults,
    service: {
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
}

/** The protected surface a test drives. Kept to the members these tests touch. */
interface Driver {
  links: mjBizAppsFormsFormDistributionEntity[];
  selectedId: string | null;
  busy: boolean;
  actionError: string | null;
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
