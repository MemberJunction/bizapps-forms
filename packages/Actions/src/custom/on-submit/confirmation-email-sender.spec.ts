/**
 * Unit tests for the CommunicationEngine-backed confirmation-email sender (Task 2), with the
 * engine seam mocked. Verifies metadata-driven send, graceful skip when unconfigured, and that
 * an engine error never throws (skips, so a submit is never failed).
 */
import { describe, expect, it, vi } from 'vitest';
import { Message } from '@memberjunction/communication-types';
import {
  CommunicationEngineConfirmationEmailSender,
  DEFAULT_MESSAGE_TYPE,
  type ConfirmationEmailConfig,
  type ConfirmationEmailEngine,
} from './confirmation-email-sender';
import type { ConfirmationEmail } from './send-confirmation-email.action';

const EMAIL: ConfirmationEmail = { to: 'r@example.com', subject: 'Thanks', body: 'Got it.' };

function fullConfig(overrides?: Partial<ConfirmationEmailConfig>): ConfirmationEmailConfig {
  return { providerName: 'SendGrid', messageTypeName: DEFAULT_MESSAGE_TYPE, fromAddress: 'no-reply@example.com', ...overrides };
}

/** A stub engine capturing the send call. */
function makeEngine(result: { Success: boolean; Error: string }): {
  engine: ConfirmationEmailEngine;
  config: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
} {
  const config = vi.fn(async () => undefined);
  const send = vi.fn(async () => result);
  return {
    engine: { Config: config, SendSingleMessage: send as unknown as ConfirmationEmailEngine['SendSingleMessage'] },
    config,
    send,
  };
}

describe('CommunicationEngineConfirmationEmailSender', () => {
  it('sends via the configured provider + message type and reports delivered', async () => {
    const { engine, config, send } = makeEngine({ Success: true, Error: '' });
    const sender = new CommunicationEngineConfirmationEmailSender({ config: fullConfig(), engine });

    const result = await sender.send(EMAIL);

    expect(result.delivered).toBe(true);
    expect(config).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    const [providerName, messageType, message] = send.mock.calls[0] as [string, string, Message];
    expect(providerName).toBe('SendGrid');
    expect(messageType).toBe(DEFAULT_MESSAGE_TYPE);
    expect(message).toBeInstanceOf(Message);
    expect(message.To).toBe('r@example.com');
    expect(message.From).toBe('no-reply@example.com');
    expect(message.Subject).toBe('Thanks');
    expect(message.Body).toBe('Got it.');
    expect(message.HTMLBody).toBe('Got it.');
  });

  it('skips (delivered:false) when no provider is configured — never sends', async () => {
    const { engine, send } = makeEngine({ Success: true, Error: '' });
    const sender = new CommunicationEngineConfirmationEmailSender({ config: fullConfig({ providerName: undefined }), engine });

    const result = await sender.send(EMAIL);

    expect(result.delivered).toBe(false);
    expect(result.detail).toMatch(/provider/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('skips when no From address is configured', async () => {
    const { engine, send } = makeEngine({ Success: true, Error: '' });
    const sender = new CommunicationEngineConfirmationEmailSender({ config: fullConfig({ fromAddress: undefined }), engine });

    const result = await sender.send(EMAIL);

    expect(result.delivered).toBe(false);
    expect(result.detail).toMatch(/from/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('reports not-delivered when the provider returns failure (does not throw)', async () => {
    const { engine } = makeEngine({ Success: false, Error: 'bad key' });
    const sender = new CommunicationEngineConfirmationEmailSender({ config: fullConfig(), engine });

    const result = await sender.send(EMAIL);
    expect(result.delivered).toBe(false);
    expect(result.detail).toMatch(/bad key/);
  });

  it('gracefully skips (never throws) when the engine throws (e.g. metadata not loaded)', async () => {
    const engine: ConfirmationEmailEngine = {
      Config: vi.fn(async () => {
        throw new Error('Metadata not loaded');
      }),
      SendSingleMessage: vi.fn(async () => ({ Success: true, Error: '' })),
    };
    const sender = new CommunicationEngineConfirmationEmailSender({ config: fullConfig(), engine });

    const result = await sender.send(EMAIL);
    expect(result.delivered).toBe(false);
    expect(result.detail).toMatch(/unavailable|misconfigured/i);
  });
});
