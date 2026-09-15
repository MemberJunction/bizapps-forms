/**
 * On-submit action: **Forms: Upsert Respondent Person**.
 *
 * Creates or links a `MJ_BizApps_Common: People` row from a form response's answers
 * (email / name / phone) and stamps `FormResponse.RespondentPersonID`. Matching is
 * loose and defensive — by email (case-insensitive). Idempotent: if the response
 * already has a RespondentPersonID, or no email was collected, it skips cleanly.
 *
 * THIS ACTION OWNS RESPONDENT IDENTITY. A consuming app should read the
 * `FormResponse.RespondentPersonID` this stamps rather than upserting its own Person from the same
 * answers — the dedupe below covers only rows this action created, so an independent upsert
 * produces a second Person for the same human that Forms neither knows about nor points at, with
 * nothing logged. An app that genuinely owns subject identity should instead decline this hook
 * (`onSubmitMode: 'Configured'`). See `docs/on-submit-automations.md`.
 *
 * Contract: invoked BY NAME by WP-B's submit endpoint (seam S3). Do not rename.
 *
 * Input params: `FormResponseID` (string, required) — the just-saved response id.
 * Output params: `PersonID` (the linked/created Person id), `Created` (boolean).
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { escapeSqlString } from '@mj-biz-apps/forms-entities';
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';
// Person comes from the package that owns __mj_BizAppsCommon — Forms deliberately
// does not generate it (rationale: `excludeSchemas` in mj.config.cjs).
import type { mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { saveOrExplain } from '../shared/save-entity';
import { explainMissingEntityClasses } from '../shared/generated-entity';
import { loadFormResponseContext, type AnswerWithType, type FormResponseContext } from '../shared/form-response-context';

const PERSON_ENTITY = 'MJ_BizApps_Common: People';

/**
 * The sibling-app entities this action writes. Checked up front rather than trusted: an
 * unregistered class does not fail the write, it silently drops every field set on it (#60).
 */
const SIBLING_ENTITIES = [PERSON_ENTITY] as const;

/** Respondent identity fields harvested from the answers. */
interface RespondentIdentity {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

@RegisterClass(BaseAction, 'Forms: Upsert Respondent Person')
export class UpsertRespondentPersonAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const responseId = getStringParam(params, 'FormResponseID');
    if (!responseId) {
      return fail('FormResponseID parameter is required', 'MISSING_PARAMETERS');
    }
    const missingClasses = explainMissingEntityClasses(SIBLING_ENTITIES);
    if (missingClasses) {
      return fail(missingClasses, 'ENTITY_CLASS_UNREGISTERED');
    }

    const ctx = await loadFormResponseContext(responseId, params.ContextUser);
    if (!ctx) {
      return skip(`FormResponse '${responseId}' not found; nothing to upsert.`);
    }
    if (ctx.response.RespondentPersonID) {
      setOutputParam(params, 'PersonID', ctx.response.RespondentPersonID);
      setOutputParam(params, 'Created', false);
      return skip('Response already linked to a Person; skipping.');
    }

    const identity = extractIdentity(ctx.answers);
    const email = identity.email;
    if (!email) {
      return skip('No email answer found; cannot match or create a Person.');
    }

    return this.upsertAndLink(ctx, identity, email, params);
  }

  private async upsertAndLink(
    ctx: FormResponseContext,
    identity: RespondentIdentity,
    email: string,
    params: RunActionParams,
  ): Promise<ActionResultSimple> {
    const contextUser = params.ContextUser;
    const existing = await findPersonByEmail(email, contextUser);
    const created = !existing;
    let person = existing;
    if (!person) {
      const outcome = await createPerson(identity, email, contextUser);
      if ('error' in outcome) {
        return fail(`Failed to create Person record: ${outcome.error}`, 'PERSON_SAVE_FAILED');
      }
      person = outcome.person;
    }

    ctx.response.RespondentPersonID = person.ID;
    const linked = await ctx.response.Save();
    if (!linked) {
      return fail(
        `Failed to link Person to response: ${ctx.response.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        'RESPONSE_SAVE_FAILED',
      );
    }

    setOutputParam(params, 'PersonID', person.ID);
    setOutputParam(params, 'Created', created);
    return {
      Success: true,
      ResultCode: 'SUCCESS',
      Message: `${created ? 'Created' : 'Linked existing'} Person ${person.ID} for response ${ctx.response.ID}.`,
    };
  }
}

/** Harvest email / phone / name from the answers, keyed on question TYPE first. */
function extractIdentity(answers: AnswerWithType[]): RespondentIdentity {
  const identity: RespondentIdentity = {};
  for (const a of answers) {
    if (!a.textValue) {
      continue;
    }
    if (!identity.email && isEmailAnswer(a)) {
      identity.email = a.textValue.trim().toLowerCase();
    } else if (!identity.phone && a.questionType === 'Phone') {
      identity.phone = a.textValue.trim();
    } else if (looksLikeName(a.prompt)) {
      assignName(identity, a.prompt, a.textValue.trim());
    }
  }
  return identity;
}

function isEmailAnswer(a: AnswerWithType): boolean {
  const looksLikeEmail = /.+@.+\..+/.test(a.textValue ?? '');
  return a.questionType === ('Email' satisfies FormQuestionType) || (looksLikeEmail && /e-?mail/i.test(a.prompt));
}

function looksLikeName(prompt: string): boolean {
  return /name/i.test(prompt);
}

/** Map a name-ish prompt to first/last; falls back to splitting a full-name string. */
function assignName(identity: RespondentIdentity, prompt: string, value: string): void {
  if (/first/i.test(prompt)) {
    identity.firstName = value;
  } else if (/last|surname|family/i.test(prompt)) {
    identity.lastName = value;
  } else if (!identity.firstName && !identity.lastName) {
    const parts = value.split(/\s+/);
    identity.firstName = parts[0];
    if (parts.length > 1) {
      identity.lastName = parts.slice(1).join(' ');
    }
  }
}

async function findPersonByEmail(
  email: string,
  contextUser: UserInfo,
): Promise<mjBizAppsCommonPersonEntity | null> {
  const rv = new RunView();
  const escaped = escapeSqlString(email);
  const result = await rv.RunView<mjBizAppsCommonPersonEntity>(
    {
      EntityName: PERSON_ENTITY,
      ExtraFilter: `LOWER(Email)='${escaped}'`,
      ResultType: 'entity_object',
      MaxRows: 1,
    },
    contextUser,
  );
  if (result.Success && result.Results.length > 0) {
    return result.Results[0];
  }
  return null;
}

async function createPerson(
  identity: RespondentIdentity,
  email: string,
  contextUser: UserInfo,
): Promise<{ person: mjBizAppsCommonPersonEntity } | { error: string }> {
  const md = new Metadata();
  const person = await md.GetEntityObject<mjBizAppsCommonPersonEntity>(PERSON_ENTITY, contextUser);
  person.NewRecord();
  // FirstName / LastName are required on People; derive sensible fallbacks from email.
  const fallback = email.split('@')[0];
  person.FirstName = identity.firstName ?? fallback;
  person.LastName = identity.lastName ?? '(unknown)';
  person.Email = email;
  if (identity.phone) {
    person.Phone = identity.phone;
  }
  person.Status = 'Active';
  const outcome = await saveOrExplain(person);
  return outcome.ok ? { person: outcome.entity } : { error: outcome.error };
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}

/** A clean skip is a *success* (the hook is safe to no-op) with a SKIPPED code. */
function skip(message: string): ActionResultSimple {
  return { Success: true, Message: message, ResultCode: 'SKIPPED' };
}
