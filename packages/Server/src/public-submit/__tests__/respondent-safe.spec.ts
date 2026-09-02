/**
 * The public resolver never lets an exception become the respondent's error text.
 *
 * `runSubmitPipeline` already honours that contract for everything inside the pipeline (#119). But
 * the resolver does real work OUTSIDE it — resolving the provider, the context user, the system
 * user and the request identity before the call, and mapping the result after — and `PublishedForm`
 * runs entirely outside any boundary. An exception from any of those reaches Apollo, which puts the
 * exception's own `message` into `errors[].message`, and the widget renders that
 * (`mj-form.component.ts:599`). Stripping the stack (`StacktraceRedactionMiddleware`) removes the
 * frames but not the sentence.
 *
 * Neither gap is reachable through the current schema — `answers` is `[FormAnswerInputType!]!`, so
 * graphql-js rejects a null list before the resolver runs, and `resolvePublishedDefinition` returns
 * a typed failure rather than throwing. This closes the CLASS rather than a demonstrated leak, for
 * the same reason `file-links.service.ts` guards its read: a contract that holds only for the
 * current implementation is not a contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { respondentSafe } from '../respondent-safe';

let logged: string[];

beforeEach(() => {
  logged = [];
  // `LogError` writes through console.error, and MJ does NOT silence it under
  // NODE_ENV=production the way it silences LogStatus — the property this boundary depends on.
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('respondentSafe', () => {
  it('returns the operation result untouched when nothing throws', async () => {
    const value = { name: 'Contact us' };

    const result = await respondentSafe('PublishedForm(x)', null, async () => value);

    expect(result).toBe(value);
    expect(logged).toHaveLength(0);
  });

  it('returns the fallback instead of the exception when the operation throws', async () => {
    const result = await respondentSafe('PublishedForm(x)', null, async () => {
      throw new Error('Connection pool exhausted for server sql-mj-it, database MJ_ATS_Dev');
    });

    expect(result).toBeNull();
  });

  it('never lets the exception text escape to the caller', async () => {
    const secret = 'ECONNREFUSED 10.0.0.7:1433 while opening __mj_BizAppsForms.FormDistribution';

    const result = await respondentSafe('SubmitFormResponse', { errors: [{ message: 'safe' }] }, async () => {
      throw new Error(secret);
    });

    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).toContain('safe');
  });

  it('logs the exception with its stack and the operation it belonged to', async () => {
    await respondentSafe('PublishedForm(gauntlet-132-leak)', null, async () => {
      throw new Error('the provider is unreachable');
    });

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('[Forms]');
    expect(logged[0]).toContain('PublishedForm(gauntlet-132-leak)');
    expect(logged[0]).toContain('the provider is unreachable');
    // The stack is what makes the log line worth having, since the wire no longer carries one.
    expect(logged[0]).toMatch(/\bat .+:\d+:\d+/);
  });

  it('handles a thrown non-Error without throwing a second time', async () => {
    const result = await respondentSafe('SubmitFormResponse', 'fallback', async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'a bare string, which any library may throw';
    });

    expect(result).toBe('fallback');
    expect(logged[0]).toContain('a bare string');
  });

  it('does not swallow the fallback when the operation legitimately resolves to null', async () => {
    // `PublishedForm` returns null for "no such published form", which is a SUCCESS, not a failure.
    // Confusing the two would make a closed form look like a server error in the log.
    const result = await respondentSafe('PublishedForm(missing)', 'fallback', async () => null);

    expect(result).toBeNull();
    expect(logged).toHaveLength(0);
  });
});
