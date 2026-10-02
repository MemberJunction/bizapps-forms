/**
 * Pure model for the "Forms" section on Common's Person record form (#285).
 *
 * `relatedJoinField` is deliberately NOT set on the registration. Reproduced against MJ
 * 6.1.4's real `ResolveFormContributions`: with both `contributionKey` and
 * `relatedJoinField` set, the stock grid key `related:<entity>:RespondentPersonID` is never
 * claimed, so MJ's stock related-entity grid still mounts beside this panel. Omitting it
 * claims every FK from Form Responses to People, and there is exactly one
 * (RespondentPersonID). The spec pins the counter-example, so if MJ fixes the resolver that
 * test flips and tells us the field may be added.
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

export type PersonFormResponseTone = 'success' | 'warning' | 'danger';

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
    case 'Disqualified': return 'danger';
    default: return 'warning'; // Partial, and any status a later CHECK widening adds
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
