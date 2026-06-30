/**
 * On-submit action: **Forms: Send Confirmation Email**.
 *
 * Sends the form's confirmation message to the respondent's email (harvested from the
 * answers, or passed explicitly). Idempotent/safe: skips cleanly when there is no
 * recipient or no message.
 *
 * Contract: invoked BY NAME by WP-B's submit endpoint (seam S3). Do not rename.
 *
 * Input params:
 *   - `FormResponseID` (string, required)
 *   - `RecipientEmail` (string, optional — overrides the harvested address)
 *   - `Subject` (string, optional — defaults to "Thanks for your submission")
 *   - `Message` (string, optional — overrides `Form.Settings.confirmationMessage`)
 * Output params: `Sent` (boolean), `RecipientEmail` (string).
 *
 * EMAIL DELIVERY: routed through a pluggable {@link ConfirmationEmailSender} seam.
 * The default ({@link LoggingConfirmationEmailSender}) does NOT actually send — it
 * logs and returns `delivered:false` with a clear TODO — because real delivery needs
 * a configured `@memberjunction/communication-engine` provider (e.g. SendGrid) plus a
 * provider/message-type metadata record (owned by WP-A). Swap in a real sender via
 * {@link setConfirmationEmailSender} once that's wired.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { parseFormSettings } from '@mj-biz-apps/forms-entities';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { loadFormResponseContext, type AnswerWithType } from '../shared/form-response-context';

/** A single confirmation email to deliver. */
export interface ConfirmationEmail {
  to: string;
  subject: string;
  body: string;
}

/** Outcome of a delivery attempt. */
export interface ConfirmationEmailResult {
  delivered: boolean;
  detail: string;
}

/** Pluggable email delivery seam (testable; swap for a real provider in prod). */
export interface ConfirmationEmailSender {
  send(email: ConfirmationEmail): Promise<ConfirmationEmailResult>;
}

/**
 * Default sender — logs and no-ops. Real delivery requires a configured
 * communication-engine provider + message-type metadata (WP-A). Until then we do not
 * pretend to send.
 */
export class LoggingConfirmationEmailSender implements ConfirmationEmailSender {
  async send(email: ConfirmationEmail): Promise<ConfirmationEmailResult> {
    // TODO(WP-A/integration): wire @memberjunction/communication-engine —
    // CommunicationEngine.Instance.SendSingleMessage('SendGrid', 'Email', message)
    // once a provider + message-type metadata record exists. See action header.
    LogStatus(
      `[Forms: Send Confirmation Email] (no-op default) would email "${email.to}" subject="${email.subject}".`,
    );
    return { delivered: false, detail: 'No email provider configured (default no-op sender).' };
  }
}

let activeSender: ConfirmationEmailSender = new LoggingConfirmationEmailSender();

/** Override the email sender (e.g. a communication-engine-backed one, or a test stub). */
export function setConfirmationEmailSender(sender: ConfirmationEmailSender): void {
  activeSender = sender;
}

const DEFAULT_SUBJECT = 'Thanks for your submission';

@RegisterClass(BaseAction, 'Forms: Send Confirmation Email')
export class SendConfirmationEmailAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const responseId = getStringParam(params, 'FormResponseID');
    if (!responseId) {
      return fail('FormResponseID parameter is required', 'MISSING_PARAMETERS');
    }

    const ctx = await loadFormResponseContext(responseId, params.ContextUser);
    if (!ctx) {
      return skip(`FormResponse '${responseId}' not found; nothing to email.`);
    }

    const recipient = getStringParam(params, 'RecipientEmail') ?? findRespondentEmail(ctx.answers);
    if (!recipient) {
      return skip('No recipient email available; skipping confirmation email.');
    }

    const body = getStringParam(params, 'Message') ?? confirmationMessageFromForm(ctx.form.Settings);
    if (!body) {
      return skip('No confirmation message configured; skipping.');
    }

    return this.deliver(
      { to: recipient, subject: getStringParam(params, 'Subject') ?? DEFAULT_SUBJECT, body },
      params,
    );
  }

  private async deliver(email: ConfirmationEmail, params: RunActionParams): Promise<ActionResultSimple> {
    const result = await activeSender.send(email);
    setOutputParam(params, 'Sent', result.delivered);
    setOutputParam(params, 'RecipientEmail', email.to);
    return {
      Success: true,
      ResultCode: result.delivered ? 'SUCCESS' : 'NOT_SENT',
      Message: result.delivered ? `Confirmation email sent to ${email.to}.` : result.detail,
    };
  }
}

/** Pull the confirmation message out of `Form.Settings` JSON (validated). */
function confirmationMessageFromForm(settingsJSON: string | null): string | undefined {
  if (!settingsJSON) {
    return undefined;
  }
  try {
    return parseFormSettings(settingsJSON).confirmationMessage;
  } catch (error) {
    LogError(`[Forms: Send Confirmation Email] invalid Form.Settings JSON: ${asText(error)}`);
    return undefined;
  }
}

/** Find the respondent's email from the answers (Email-typed question first). */
function findRespondentEmail(answers: AnswerWithType[]): string | undefined {
  const byType = answers.find((a) => a.questionType === 'Email' && a.textValue);
  if (byType?.textValue) {
    return byType.textValue.trim();
  }
  const byShape = answers.find((a) => a.textValue && /.+@.+\..+/.test(a.textValue));
  return byShape?.textValue?.trim();
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}

function skip(message: string): ActionResultSimple {
  return { Success: true, Message: message, ResultCode: 'SKIPPED' };
}
