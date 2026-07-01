/**
 * Real confirmation-email delivery for the **Forms: Send Confirmation Email** on-submit
 * action, backed by MJ's {@link CommunicationEngine} (seam S3 / Task 2).
 *
 * The {@link ConfirmationEmailSender} seam (declared in the action file) stays exactly as it
 * was — pluggable and testable. This module adds a real sender,
 * {@link CommunicationEngineConfirmationEmailSender}, which routes through the metadata-driven
 * communication engine. The no-op {@link LoggingConfirmationEmailSender} is retained for tests
 * and offline installs.
 *
 * METADATA-DRIVEN, NOT VENDOR-HARDCODED: the provider (e.g. "SendGrid", "MSGraph") is a
 * `CommunicationProvider` metadata record; this code only names *which* provider + message type
 * + From address to use — supplied as {@link ConfirmationEmailConfig}. The vendor is never
 * imported or hardcoded, and the config is NOT read from `process.env` here (this actions
 * package is deliberately free of node globals); the SERVER package injects the deployment
 * config when it installs the sender. Swapping providers is a metadata/config change.
 *
 * GRACEFUL SKIP (never fails the submit): with no provider/From configured, or when the engine
 * throws (metadata can't load / provider or message-type not found — see
 * `CommunicationEngine.SendSingleMessage`), delivery is reported as `delivered:false` with a
 * reason. The submit already succeeded; the confirmation email is a best-effort side effect.
 */
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import {
  type ConfirmationEmail,
  type ConfirmationEmailResult,
  type ConfirmationEmailSender,
  setConfirmationEmailSender,
} from './send-confirmation-email.action';

/**
 * Deployment config selecting which configured `CommunicationProvider` record to send through.
 * Nothing here is a specific vendor — these just name a metadata provider + message type + From.
 */
export interface ConfirmationEmailConfig {
  /** CommunicationProvider metadata Name (e.g. "SendGrid"). Unset ⇒ graceful skip. */
  providerName: string | undefined;
  /** Provider message-type Name (e.g. "Email"). */
  messageTypeName: string;
  /** From address (required by every provider). Unset ⇒ graceful skip. */
  fromAddress: string | undefined;
  /** Optional friendly From display name. */
  fromName?: string;
}

/** The default message type when a deployment does not specify one. */
export const DEFAULT_MESSAGE_TYPE = 'Email';

/** Minimal engine surface this sender depends on — lets tests inject a stub with no `any`. */
export interface ConfirmationEmailEngine {
  Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;
  SendSingleMessage(
    providerName: string,
    providerMessageTypeName: string,
    message: Message,
  ): Promise<{ Success: boolean; Error: string }>;
}

/**
 * Confirmation sender backed by MJ's {@link CommunicationEngine}. The engine, provider, and
 * message type are all resolved from metadata; this class only supplies the recipient + body.
 */
export class CommunicationEngineConfirmationEmailSender implements ConfirmationEmailSender {
  private readonly config: ConfirmationEmailConfig;
  private readonly contextUser: UserInfo | undefined;
  private readonly engine: ConfirmationEmailEngine;

  constructor(options: {
    config: ConfirmationEmailConfig;
    contextUser?: UserInfo;
    engine?: ConfirmationEmailEngine;
  }) {
    this.config = options.config;
    this.contextUser = options.contextUser;
    this.engine = options.engine ?? (CommunicationEngine.Instance as unknown as ConfirmationEmailEngine);
  }

  async send(email: ConfirmationEmail): Promise<ConfirmationEmailResult> {
    if (!this.config.providerName) {
      return skip('No communication provider configured; skipping confirmation email.');
    }
    if (!this.config.fromAddress) {
      return skip('No From address configured; skipping confirmation email.');
    }
    return this.trySend(email, this.config.providerName, this.config.fromAddress);
  }

  /** Configure the engine and send one message, converting any thrown error into a skip. */
  private async trySend(email: ConfirmationEmail, providerName: string, fromAddress: string): Promise<ConfirmationEmailResult> {
    try {
      await this.engine.Config(false, this.contextUser);
      const result = await this.engine.SendSingleMessage(
        providerName,
        this.config.messageTypeName,
        this.buildMessage(email, fromAddress),
      );
      if (result.Success) {
        LogStatus(`[Forms: Send Confirmation Email] sent to "${email.to}" via ${providerName}.`);
        return { delivered: true, detail: `Sent via ${providerName}.` };
      }
      return skip(`Communication provider "${providerName}" reported failure: ${result.Error}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      LogError(`[Forms: Send Confirmation Email] delivery skipped: ${detail}`);
      return skip(`Communication engine unavailable/misconfigured: ${detail}`);
    }
  }

  /** Assemble the {@link Message}: HTML + plain-text bodies from the confirmation content. */
  private buildMessage(email: ConfirmationEmail, fromAddress: string): Message {
    const message = new Message();
    message.From = fromAddress;
    if (this.config.fromName) {
      message.FromName = this.config.fromName;
    }
    message.To = email.to;
    message.Subject = email.subject;
    message.Body = email.body;
    message.HTMLBody = email.body;
    return message;
  }
}

/** A skipped (not-delivered) outcome — the submit still succeeds. */
function skip(detail: string): ConfirmationEmailResult {
  return { delivered: false, detail };
}

/**
 * Install the CommunicationEngine-backed sender as the active default (called by the SERVER
 * package once it has resolved the deployment config). Idempotent — re-installing replaces.
 * Tests that need the no-op behavior call
 * `setConfirmationEmailSender(new LoggingConfirmationEmailSender())`.
 */
export function installCommunicationEngineConfirmationSender(config: ConfirmationEmailConfig): void {
  setConfirmationEmailSender(new CommunicationEngineConfirmationEmailSender({ config }));
}
