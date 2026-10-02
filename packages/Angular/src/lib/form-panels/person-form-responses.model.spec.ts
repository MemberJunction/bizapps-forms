import { describe, expect, it } from 'vitest';
import {
  RelatedEntitySectionKey,
  ResolveFormContributions,
} from '@memberjunction/ng-base-forms/dist/lib/panel-slot/form-contribution.js';
import {
  BuildPersonFormResponsesFilter,
  FormatResponseWhen,
  PERSON_FORMS_REGISTRATION,
  PERSON_FORMS_SECTION_KEY,
  SectionMountLatch,
  ToPersonFormResponseRows,
  type PersonFormResponseRaw,
} from './person-form-responses.model';
import { FORMS_ENTITY } from '../shared/entity-names';
import type { ResponseStatus } from '../responses/response-models';

const PEOPLE = 'MJ_BizApps_Common: People';
const RESPONSES = FORMS_ENTITY.FormResponse;
const REL = {
  RelatedEntity: RESPONSES,
  RelatedEntityID: '11111111-1111-1111-1111-111111111111',
  RelatedEntityJoinField: 'RespondentPersonID',
  DisplayInForm: true,
};

describe('PERSON_FORMS_REGISTRATION', () => {
  it('targets People, after-related, with the forms key and no join field', () => {
    expect(PERSON_FORMS_REGISTRATION.entity).toBe('MJ_BizApps_Common: People');
    expect(PERSON_FORMS_REGISTRATION.slot).toBe('after-related');
    expect(PERSON_FORMS_REGISTRATION.relatedEntity).toBe(RESPONSES);
    expect(PERSON_FORMS_REGISTRATION.contributionKey).toBe('forms');
    expect(PERSON_FORMS_SECTION_KEY).toBe('forms');
    expect(PERSON_FORMS_REGISTRATION.relatedJoinField).toBeUndefined();
  });

  it('claims the stock grid and wins as the only registered contribution', () => {
    const r = ResolveFormContributions({
      EntityName: PEOPLE,
      RelatedEntities: [REL],
      IsaChildEntityIDs: [],
      Registrations: [{ Priority: 0, Metadata: PERSON_FORMS_REGISTRATION }],
      BakedSectionKeys: [],
      ShowRelatedEntities: true,
    });
    expect(r.StockGrids).toEqual([]);
    expect(r.Winners).toHaveLength(1);
    expect(r.Winners[0].Kind).toBe('registered');
    expect(r.Winners[0].ContributionKey).toBe('forms');
  });

  it('hides a baked grid on a host whose Person form was regenerated', () => {
    const key = RelatedEntitySectionKey(REL, [REL]);
    const r = ResolveFormContributions({
      EntityName: PEOPLE,
      RelatedEntities: [REL],
      IsaChildEntityIDs: [],
      Registrations: [{ Priority: 0, Metadata: PERSON_FORMS_REGISTRATION }],
      BakedSectionKeys: [key],
      ShowRelatedEntities: true,
    });
    expect(r.HiddenBakedSectionKeys).toContain(key);
  });

  it('counter-example: adding relatedJoinField leaves a stock grid mounted', () => {
    // MJ resolver defect, filed as MemberJunction/MJ#4990: with both contributionKey and
    // relatedJoinField set, the stock grid key is never claimed. If this test flips, MJ fixed it
    // and the registration may name RespondentPersonID explicitly.
    const r = ResolveFormContributions({
      EntityName: PEOPLE,
      RelatedEntities: [REL],
      IsaChildEntityIDs: [],
      Registrations: [
        { Priority: 0, Metadata: { ...PERSON_FORMS_REGISTRATION, relatedJoinField: 'RespondentPersonID' } },
      ],
      BakedSectionKeys: [],
      ShowRelatedEntities: true,
    });
    expect(r.StockGrids.length).toBeGreaterThan(0);
  });
});

describe('BuildPersonFormResponsesFilter', () => {
  it('returns the exact predicate for a GUID', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(BuildPersonFormResponsesFilter(id)).toBe(`RespondentPersonID='${id}'`);
  });
  it.each(['', "x' OR 1=1 --"])('rejects %j', (bad) => {
    expect(() => BuildPersonFormResponsesFilter(bad)).toThrow(/GUID/i);
  });
});

describe('ToPersonFormResponseRows', () => {
  const mk = (over: Partial<PersonFormResponseRaw>): PersonFormResponseRaw => ({
    ID: 'a', FormID: 'f', Form: 'Intake', Status: 'Complete',
    StartedAt: null, SubmittedAt: null, __mj_CreatedAt: '2026-01-01T00:00:00Z', ...over,
  });

  it('maps tone, in-progress, dates and preserves order', () => {
    const rows = ToPersonFormResponseRows([
      mk({ ID: '1', Status: 'Complete', StartedAt: '2026-01-02T10:00:00Z', SubmittedAt: '2026-01-02T10:05:00Z' }),
      mk({ ID: '2', Status: 'Partial', StartedAt: '2026-01-03T10:00:00Z' }),
      mk({ ID: '3', Status: 'Disqualified' }),
    ]);
    expect(rows.map((r) => r.ResponseID)).toEqual(['1', '2', '3']);
    // Agrees with Forms' own Responses list: only Complete is coloured success; Partial is
    // warning because the issue requires an in-progress response to be clearly marked.
    expect(rows.map((r) => r.Tone)).toEqual(['success', 'warning', 'neutral']);
    expect(rows.map((r) => r.IsInProgress)).toEqual([false, true, false]);
    expect(rows[0].StartedAt).toBeInstanceOf(Date);
    expect(rows[0].SubmittedAt).toBeInstanceOf(Date);
    expect(rows[1].SubmittedAt).toBeNull();
    expect(rows[2].StartedAt).toBeNull();
    expect(rows[0].FormName).toBe('Intake');
  });

  it('pre-formats the display dates, and marks a missing one with a dash', () => {
    const started = '2026-01-02T10:00:00Z';
    const [row] = ToPersonFormResponseRows([mk({ StartedAt: started, SubmittedAt: null })]);
    expect(row.StartedText).toBe(FormatResponseWhen(new Date(started)));
    expect(row.SubmittedText).toBe('—');
  });

  it('treats a status a later CHECK widening adds as neutral, not in progress', () => {
    // The Raw type only admits today's statuses; the server can still send a newer one.
    const widened = (status: string): PersonFormResponseRaw =>
      mk({ Status: status as ResponseStatus });
    const [row] = ToPersonFormResponseRows([widened('Abandoned')]);
    expect(row.Tone).toBe('neutral');
    expect(row.IsInProgress).toBe(false);
  });

  it('maps an unparseable date string to null and a dash', () => {
    const [row] = ToPersonFormResponseRows([mk({ StartedAt: 'not a date' })]);
    expect(row.StartedAt).toBeNull();
    expect(row.StartedText).toBe('—');
  });
});

describe('FormatResponseWhen', () => {
  it('renders an em dash for null', () => {
    expect(FormatResponseWhen(null)).toBe('—');
  });
  it('renders a date', () => {
    const s = FormatResponseWhen(new Date('2026-01-02T10:00:00Z'));
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain('Invalid');
  });
});

describe('SectionMountLatch', () => {
  // Records are compared by identity only, so any object stands in for one.
  const recordA = { id: 'a' };
  const recordB = { id: 'b' };

  it('stays unmounted (no query) until the section is first expanded', () => {
    const latch = new SectionMountLatch<object>();
    latch.Observe(recordA, true, false);
    expect(latch.IsMounted()).toBe(false);
  });

  it('mounts on expansion and stays mounted after a collapse', () => {
    const latch = new SectionMountLatch<object>();
    latch.Observe(recordA, true, true);
    expect(latch.IsMounted()).toBe(true);
    latch.Observe(recordA, true, false);
    expect(latch.IsMounted()).toBe(true);
  });

  it('never mounts for an unsaved record, even when expanded', () => {
    const latch = new SectionMountLatch<object>();
    latch.Observe(recordA, false, true);
    expect(latch.IsMounted()).toBe(false);
  });

  it('resets when the record changes, so a collapsed section for the new record stays lazy', () => {
    const latch = new SectionMountLatch<object>();
    latch.Observe(recordA, true, true);
    latch.Observe(recordB, true, false);
    expect(latch.IsMounted()).toBe(false);
  });
});
