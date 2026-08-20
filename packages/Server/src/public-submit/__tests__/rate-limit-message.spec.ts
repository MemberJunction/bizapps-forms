import { describe, expect, it } from 'vitest';

import { rateLimitedMessage } from '../rate-limit.service';

describe('rateLimitedMessage', () => {
  it('says how long to wait, because the limiter already knows', () => {
    // The check returns `retryAfterMs` and the pipeline discarded it, telling the
    // respondent to "retry shortly" — which is the one thing they cannot act on. They do
    // not know whether shortly is two seconds or an hour, so they either give up or hammer
    // the endpoint the limit exists to protect.
    expect(rateLimitedMessage(43_000)).toMatch(/43 seconds/);
  });

  it('rounds up, so the time it names is always long enough', () => {
    // Naming 12 seconds when 12.4 remain sends them back to the same refusal.
    expect(rateLimitedMessage(12_400)).toMatch(/13 seconds/);
  });

  it('uses the singular for one second', () => {
    expect(rateLimitedMessage(600)).toMatch(/1 second\b/);
  });

  it('stays sensible when the wait is unknown', () => {
    expect(rateLimitedMessage(undefined)).toMatch(/moment|shortly/i);
    expect(rateLimitedMessage(0)).toMatch(/moment|shortly/i);
  });
});
