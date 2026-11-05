/**
 * The form owner's notice of a final submit's dead letter (#311). The drain's log line reaches an
 * operator; this reaches the person who owns the form, through MJ notifications (in-app by default,
 * the type's `Form Automation Failed` record ships in `metadata/notification-types/`).
 *
 * Best-effort, and never thrown: the event has already settled `DeadLetter` when this runs, and
 * nothing here may change that. Every way it can fail to notify is one log line naming the response:
 * a status line when there is nobody to tell (the form has no owner, or the response or its form is
 * gone), an error line when telling them failed — including a send that RETURNS `success: false`,
 * which is what MJ's engine does for a type the host has not been seeded with yet (the normal state
 * between this code shipping and the release seed reaching that host).
 */
import { LogError, LogStatus, type DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { NotificationEngine, type SendNotificationParams } from '@memberjunction/notifications';
import { quoteSqlString, type mjBizAppsFormsFormEntityType, type mjBizAppsFormsFormResponseEntityType } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../../shared/entity-names.js';
import { withIsolatedProvider } from '../../shared/isolated-provider.js';
import type { ResponseSubmittedTrigger } from './response-submitted-event.js';

/** The `MJ: User Notification Types` name the notice is sent as; the record ships in `metadata/notification-types/`. */
export const DEAD_LETTER_NOTIFICATION_TYPE = 'Form Automation Failed';

/** One final submit's dead letter, as the drain settled it. */
export interface DeadLetterNotice {
  responseId: string;
  eventId: string;
  trigger: ResponseSubmittedTrigger;
  reason: string;
  stepsClosed: string[];
}

/** Who the notice goes to: the response's form and its owner; `null` when the response or form cannot be found. */
type FormOwner = { formName: string; ownerUserId: string | null } | null;

/** The two MJ effects the notice needs — a seam, so specs need no database or engine. */
export interface DeadLetterNoticeSeams {
  readonly findOwner?: (responseId: string, provider: DatabaseProviderBase, contextUser: UserInfo) => Promise<FormOwner>;
  readonly send?: (params: SendNotificationParams, contextUser: UserInfo) => Promise<{ success: boolean; errors?: string[] }>;
}

/** Notify the form's owner of a final's dead letter, as `contextUser`. Best-effort; never throws. */
export async function sendDeadLetterNotice(
  notice: DeadLetterNotice,
  contextUser: UserInfo,
  source: IMetadataProvider | null,
  seams: DeadLetterNoticeSeams = {},
): Promise<void> {
  const findOwner = seams.findOwner ?? findFormOwner;
  const send = seams.send ?? sendThroughEngine;
  const subject = `the ${notice.trigger} dead letter of response ${notice.responseId} (event ${notice.eventId})`;
  try {
    // The owner read gets its own isolated instance, released before the send: the send writes
    // through MJ's engine, which uses the process provider and needs nothing of this one.
    const owner = await withIsolatedProvider(
      `Forms dead-letter notice owner read for response ${notice.responseId}`,
      (provider) => findOwner(notice.responseId, provider, contextUser),
      source,
    );
    if (!owner) {
      LogStatus(`[Forms automation drain] no notice sent for ${subject}: the response or its form no longer exists.`);
      return;
    }
    if (!owner.ownerUserId) {
      LogStatus(`[Forms automation drain] no notice sent for ${subject}: form "${owner.formName}" has no owner.`);
      return;
    }
    const result = await send(
      {
        userId: owner.ownerUserId,
        typeNameOrId: DEAD_LETTER_NOTIFICATION_TYPE,
        title: `Automations failed for "${owner.formName}"`,
        message: `A submitted response to "${owner.formName}" will not have its automations retried: ${notice.reason} ${stepsClosed(notice.stepsClosed)}`,
        resourceConfiguration: { FormResponseID: notice.responseId, FormAutomationEventID: notice.eventId },
      },
      contextUser,
    );
    if (!result.success) {
      LogError(`[Forms automation drain] the owner notice of ${subject} was not sent: ${(result.errors ?? []).join('; ') || 'no reason given'}`);
    }
  } catch (err) {
    LogError(`[Forms automation drain] the owner notice of ${subject} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The close-out's tail, shared by the drain's give-up log lines and the owner's notice. */
export function stepsClosed(closed: string[]): string {
  return `Steps closed: ${closed.length > 0 ? closed.join(', ') : 'none'}.`;
}

/** The response's form, then that form's name and owner. A failed read throws, with the view's error. */
async function findFormOwner(responseId: string, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<FormOwner> {
  const response = await readById<Pick<mjBizAppsFormsFormResponseEntityType, 'FormID'>>(provider, FORMS_ENTITY.FormResponse, responseId, ['FormID'], contextUser);
  if (!response) {
    return null;
  }
  const form = await readById<Pick<mjBizAppsFormsFormEntityType, 'Name' | 'OwnerUserID'>>(provider, FORMS_ENTITY.Form, response.FormID, ['Name', 'OwnerUserID'], contextUser);
  return form ? { formName: form.Name, ownerUserId: form.OwnerUserID } : null;
}

async function readById<T>(provider: DatabaseProviderBase, entityName: string, id: string, fields: string[], contextUser: UserInfo): Promise<T | undefined> {
  const result = await provider.RunView<T>({ EntityName: entityName, ExtraFilter: `ID=${quoteSqlString(id)}`, Fields: fields, ResultType: 'simple' }, contextUser);
  if (!result.Success) {
    throw new Error(`could not read ${entityName} ${id}: ${result.ErrorMessage}`);
  }
  return result.Results[0];
}

async function sendThroughEngine(params: SendNotificationParams, contextUser: UserInfo): Promise<{ success: boolean; errors?: string[] }> {
  await NotificationEngine.Instance.Config(false, contextUser);
  return NotificationEngine.Instance.SendNotification(params, contextUser);
}
