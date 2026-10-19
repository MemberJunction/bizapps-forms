import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (message: string) => logged.push(message),
}));

const { runOutputText } = await import('./run-output-text');

// Click-through observation 2: "What this submission did" printed the stored column as it is,
// `{"summary":"Skipped 44C5700D-…"}` — JSON, with a record id no reader can use.
describe('runOutputText', () => {
  it('shows the summary text, not the JSON envelope the dispatcher stores it in', () => {
    expect(runOutputText('{"summary":"Analyzed 1 free-text answer(s) for the response."}')).toBe(
      'Analyzed 1 free-text answer(s) for the response.',
    );
  });

  it('never shows a record id', () => {
    expect(runOutputText('{"summary":"Skipped 44C5700D-7BA4-4838-B00F-3B6F11D6E8C6"}')).toBe('Skipped');
    expect(
      runOutputText(
        '{"summary":"Linked existing Person a74c1234-1111-4222-8333-944455556666 for response 21673E7B-1111-4222-8333-944455556666."}',
      ),
    ).toBe('Linked existing Person for response.');
  });

  it('shows nothing when only an id was said', () => {
    expect(runOutputText('{"summary":"21673E7B-1111-4222-8333-944455556666"}')).toBeNull();
  });

  it('shows nothing for an empty or missing value', () => {
    expect(runOutputText(null)).toBeNull();
    expect(runOutputText('')).toBeNull();
    expect(runOutputText('{"summary":""}')).toBeNull();
  });

  it('shows plain text that was never JSON as it is, ids removed', () => {
    expect(runOutputText('Created 7F367F15-B60D-49FF-A85F-3F62B5F2AE42')).toBe('Created');
    expect(runOutputText('Sent the confirmation email.')).toBe('Sent the confirmation email.');
  });

  it('shows nothing for an envelope that carries no summary, rather than the JSON', () => {
    expect(runOutputText('{"other":1}')).toBeNull();
  });

  it('shows text that merely starts with a bracket as text — the envelope is always an object', () => {
    logged.length = 0;
    expect(runOutputText('[Retry] Sent the confirmation email.')).toBe('[Retry] Sent the confirmation email.');
    expect(logged).toEqual([]);
  });

  it('shows a broken envelope as text, and logs nothing — this runs on every render of the list', () => {
    logged.length = 0;
    expect(runOutputText('{summary: Sent}')).toBe('{summary: Sent}');
    expect(logged).toEqual([]);
  });
});
