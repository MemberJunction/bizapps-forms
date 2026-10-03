/**
 * Pure model for the "Forms" section on Common's Person record form (#285).
 *
 * `relatedJoinField` is deliberately NOT set on the registration. Reproduced against MJ
 * 6.1.4's real `ResolveFormContributions` and filed upstream as MemberJunction/MJ#4990: with
 * both `contributionKey` and `relatedJoinField` set, the stock grid key
 * `related:<entity>:RespondentPersonID` is never claimed, so MJ's stock related-entity grid
 * still mounts beside this panel. Omitting it claims EVERY FK from Form Responses to People,
 * which is correct only while there is exactly one: `FK_FormResponse_RespondentPerson`
 * (FormResponse.RespondentPersonID -> Common Person). A second FK to Person would be silently
 * claimed by this panel too — revisit this registration if one is ever added. The spec pins the
 * counter-example, so if MJ fixes the resolver that test flips and the field may be added.
 */
import type { FormPanelRegistrationMetadata } from '@memberjunction/ng-base-forms';
import { FORMS_ENTITY } from '../shared/entity-names';
import type { ResponseStatus } from '../responses/response-models';
import { toDate } from '../shared/runview-dates';

export const PERSON_FORMS_SECTION_KEY = 'forms';

export const PERSON_FORMS_REGISTRATION: FormPanelRegistrationMetadata = {
  entity: 'MJ_BizApps_Common: People',
  slot: 'after-related',
  sortKey: 60,
  relatedEntity: FORMS_ENTITY.FormResponse,
  contributionKey: PERSON_FORMS_SECTION_KEY,
};

export const PERSON_FORM_RESPONSE_FIELDS = [
  'ID', 'FormID', 'Form', 'Status', 'StartedAt', 'SubmittedAt', '__mj_CreatedAt',
] as const;

export interface PersonFormResponseRaw {
  ID: string;
  FormID: string;
  Form: string;
  Status: ResponseStatus;
  StartedAt: Date | string | null;
  SubmittedAt: Date | string | null;
  __mj_CreatedAt: Date | string;
}

/**
 * Badge tone. Agrees with Forms' own Responses list (only Complete is coloured success), except
 * that Partial is `warning` because an in-progress response must be clearly marked. `neutral`
 * renders the plain badge with no modifier.
 */
export type PersonFormResponseTone = 'success' | 'warning' | 'neutral';

export interface PersonFormResponseRow {
  ResponseID: string;
  FormName: string;
  Status: ResponseStatus;
  Tone: PersonFormResponseTone;
  IsInProgress: boolean;
  StartedAt: Date | null;
  SubmittedAt: Date | null;
  /** `StartedAt` as display text, formatted once here so the template does not re-format per check. */
  StartedText: string;
  /** `SubmittedAt` as display text; `—` when not submitted. */
  SubmittedText: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Builds the RunView filter; the id is interpolated, so it must be a GUID. */
export function BuildPersonFormResponsesFilter(personId: string): string {
  if (!GUID.test(personId)) {
    throw new Error(`Cannot list form responses: person id is not a GUID (got ${JSON.stringify(personId)}).`);
  }
  return `RespondentPersonID='${personId}'`;
}

function toneFor(status: ResponseStatus): PersonFormResponseTone {
  switch (status) {
    case 'Complete': return 'success';
    case 'Partial': return 'warning';
    default: return 'neutral'; // Disqualified, and any status a later CHECK widening adds
  }
}

/** Maps raw rows to display rows, preserving order (the server sorts). */
export function ToPersonFormResponseRows(raw: readonly PersonFormResponseRaw[]): PersonFormResponseRow[] {
  return raw.map((r) => {
    const startedAt = toDate(r.StartedAt);
    const submittedAt = toDate(r.SubmittedAt);
    return {
      ResponseID: r.ID,
      FormName: r.Form,
      Status: r.Status,
      Tone: toneFor(r.Status),
      IsInProgress: r.Status === 'Partial',
      StartedAt: startedAt,
      SubmittedAt: submittedAt,
      StartedText: FormatResponseWhen(startedAt),
      SubmittedText: FormatResponseWhen(submittedAt),
    };
  });
}

/**
 * Formats a response timestamp for the Person Forms list in the viewer's locale (medium date,
 * short time). `null` — never started, never submitted, or unparseable — renders as `—`.
 */
export function FormatResponseWhen(value: Date | null): string {
  if (value === null) return '—';
  return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Keeps a lazily-mounted section body mounted once it has been shown: unmounted until the section
 * is first expanded for a saved record, then mounted through any collapse/expand, until the record
 * changes. Records are compared by identity, so a different record starts lazy again.
 */
export class SectionMountLatch<TRecord extends object> {
  private latchedFor: TRecord | null = null;

  /** Feeds one change-detection pass of the host. */
  public Observe(record: TRecord, isSaved: boolean, isExpanded: boolean): void {
    if (this.latchedFor !== record) this.latchedFor = null;
    if (this.latchedFor === null && isSaved && isExpanded) this.latchedFor = record;
  }

  public IsMounted(): boolean {
    return this.latchedFor !== null;
  }
}
