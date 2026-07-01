/**
 * Server-side installer for the real confirmation-email sender (Task 2).
 *
 * The pluggable sender + the CommunicationEngine-backed implementation live in
 * `@mj-biz-apps/forms-actions` (which is deliberately free of node globals). The DEPLOYMENT
 * config — which configured `CommunicationProvider` to send through, and the From address — is
 * legitimately environment-driven, so it is read HERE (the server package, where `process.env`
 * exists) and injected when installing the sender at server module load.
 *
 * This does NOT hardcode a vendor: `FORMS_EMAIL_PROVIDER` names a `CommunicationProvider`
 * METADATA record; the actual transport (SendGrid/MSGraph/etc.) is chosen by that metadata,
 * per the "no env/app vendor pick" rule. With no provider/From configured, the sender gracefully
 * skips (the LoggingConfirmationEmailSender no-op remains the effective behavior), and a submit
 * is never failed by a missing email configuration.
 *
 * Env vars:
 *  - `FORMS_EMAIL_PROVIDER`      CommunicationProvider metadata Name (e.g. "SendGrid"). Unset ⇒ skip.
 *  - `FORMS_EMAIL_MESSAGE_TYPE`  Provider message-type Name. Default "Email".
 *  - `FORMS_EMAIL_FROM`          From address. Unset ⇒ skip.
 *  - `FORMS_EMAIL_FROM_NAME`     Optional friendly From display name.
 */
import {
  DEFAULT_MESSAGE_TYPE,
  installCommunicationEngineConfirmationSender,
  type ConfirmationEmailConfig,
} from '@mj-biz-apps/forms-actions';

/** Read the confirmation-email deployment config from the environment. */
export function readConfirmationEmailConfig(): ConfirmationEmailConfig {
  return {
    providerName: process.env.FORMS_EMAIL_PROVIDER?.trim() || undefined,
    messageTypeName: process.env.FORMS_EMAIL_MESSAGE_TYPE?.trim() || DEFAULT_MESSAGE_TYPE,
    fromAddress: process.env.FORMS_EMAIL_FROM?.trim() || undefined,
    fromName: process.env.FORMS_EMAIL_FROM_NAME?.trim() || undefined,
  };
}

/**
 * Install the CommunicationEngine-backed confirmation-email sender as the default, using the
 * env-driven deployment config. Called at server module load. Idempotent.
 */
export function installConfirmationEmailSender(): void {
  installCommunicationEngineConfirmationSender(readConfirmationEmailConfig());
}
