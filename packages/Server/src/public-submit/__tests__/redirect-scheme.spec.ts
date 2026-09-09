/**
 * The server half of the `javascript:` redirect fix, driven through the real submit pipeline.
 *
 * An ending screen's `redirectURL` is AUTHOR-controlled and the widget follows the echoed value
 * with `window.location.assign` on whatever third-party site embeds the form — so a
 * `javascript:` or `data:` URL here is script injection into the EMBEDDING page's origin, not
 * ours. The widget validates too, but a bespoke client consuming `SubmitFormResponse` directly
 * gets only this check, which is why the duplication is deliberate and both halves are tested.
 *
 * Relative URLs must survive: they cannot smuggle a scheme, and only the client knows the base
 * to resolve them against.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

import { runSubmitPipeline, type PipelineContext } from '../submit-pipeline';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';
import {
  makeContextUser,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from './fakes';

/**
 * A one-question form whose SETTINGS-level redirect is the value under test. `endingRedirectUrl`
 * falls back from the screen to the settings, so this reaches the same chokepoint an ending
 * screen would without needing a screen fixture.
 */
function definitionRedirectingTo(redirectUrl: string): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    name: 'Redirect fixture',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false, redirectUrl },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        questions: [
          {
            id: 'q1',
            type: 'ShortText',
            prompt: 'Your name',
            isRequired: false,
            displayOrder: 1,
            settings: {},
            options: [],
          },
        ],
      },
    ],
  } as unknown as PublishedFormDefinition;
}

/** Submit one answer to a form configured with `redirectUrl`, and return the echoed result. */
async function submitWithRedirect(redirectUrl: string) {
  const fake = makeFakeProvider({
    distribution: makeDistribution({ CaptchaRequired: false, MaxResponses: null, ResponseCount: 0 }),
    version: makeVersion(definitionRedirectingTo(redirectUrl)),
    createPermissions: respondentPermissions(),
  });
  const ctx: PipelineContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: `sess-${Math.random().toString(36).slice(2)}`,
    fireHooks: async () => [],
  };
  return runSubmitPipeline(ctx, {
    distributionSlug: 'slug-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q1', textValue: 'a name' }],
  });
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
});

describe('an ending redirect that names a dangerous scheme', () => {
  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
  ])('is dropped from the echo — %s', async (_label, url) => {
    const result = await submitWithRedirect(url);

    expect(result.success).toBe(true);
    expect(result.redirectUrl).toBeUndefined();
  });

  it.each([
    ['upper case', 'JAVASCRIPT:alert(1)'],
    ['mixed case', 'JaVaScRiPt:alert(1)'],
    ['leading whitespace', '   javascript:alert(1)'],
    ['an embedded tab', 'java\tscript:alert(1)'],
    ['an embedded newline', 'java\nscript:alert(1)'],
    ['an embedded carriage return', 'java\rscript:alert(1)'],
  ])('is still dropped when the scheme is obfuscated by %s', async (_label, url) => {
    // The WHATWG URL parser strips tabs/newlines and lower-cases the scheme BEFORE deciding
    // whether the string parses, so every one of these lands in the scheme check rather than
    // sliding into the "no scheme, must be relative" branch. That is the load-bearing claim of
    // the fix's comment, and these are what hold it to it.
    const result = await submitWithRedirect(url);

    expect(result.redirectUrl).toBeUndefined();
  });

  it('falls back to the confirmation message rather than leaving the respondent with nothing', async () => {
    // A dropped redirect must not produce a blank ending: redirect and message are alternatives,
    // so removing one has to re-enable the other.
    const result = await submitWithRedirect('javascript:alert(1)');

    expect(result.confirmationMessage).toBeTruthy();
  });
});

describe('an ending redirect that is legitimate', () => {
  it.each([
    ['https', 'https://example.com/thanks'],
    ['http', 'http://example.com/thanks'],
    ['https with a query and fragment', 'https://example.com/t?a=1#done'],
  ])('is echoed verbatim — %s', async (_label, url) => {
    const result = await submitWithRedirect(url);

    expect(result.redirectUrl).toBe(url);
  });

  it.each([
    ['root-relative', '/thanks'],
    ['document-relative', 'thanks'],
    ['query-only', '?done=1'],
  ])('is echoed verbatim when %s — only the client knows the base', async (_label, url) => {
    const result = await submitWithRedirect(url);

    expect(result.redirectUrl).toBe(url);
  });

  it('suppresses the confirmation message when a redirect survives', async () => {
    // Sending both would let a client that ignores the redirect show a message meant for a page
    // nobody lands on.
    const result = await submitWithRedirect('https://example.com/thanks');

    expect(result.confirmationMessage).toBeUndefined();
  });
});

describe('a redirect the server cannot parse', () => {
  it('is passed through, because on the server "did not parse" means "relative"', async () => {
    // Documents a DELIBERATE divergence from the widget, which parses with the page as base and
    // refuses this same input as unparseable. The server has no base — only the client knows what
    // page the widget is embedded in — so it cannot distinguish "malformed" from "relative" and
    // passes it to the party that can. Safe because a string that names a scheme is caught by the
    // check above; the worst case here is a client that fails to navigate.
    const result = await submitWithRedirect('http://[');

    expect(result.redirectUrl).toBe('http://[');
  });

  it('still refuses one that names a scheme, however malformed the rest is', async () => {
    // The boundary of the concession above: unparseable is admitted, scheme-bearing is not.
    const result = await submitWithRedirect('javascript:://[');

    expect(result.redirectUrl).toBeUndefined();
  });
});

describe('an ending redirect that is absent', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('yields no redirect at all rather than an empty one — %s', async (_label, url) => {
    const result = await submitWithRedirect(url);

    expect(result.redirectUrl).toBeUndefined();
    expect(result.confirmationMessage).toBeTruthy();
  });
});


/**
 * The DISQUALIFICATION redirect is a SECOND call site of the same guard.
 *
 * Worth its own block rather than trusting the confirmation tests: neutralising
 * `disqualificationFields`' call to `safeRedirectUrl` while leaving `confirmationFields` guarded
 * left the entire `public-submit` suite green (395 passed, 0 failed). One guarded call site does
 * not test the other, and a screened-out respondent is redirected by different code.
 */
function knockoutDefinitionRedirectingTo(redirectUrl: string): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    name: 'Screener',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Default thanks.' },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        questions: [
          {
            id: 'age',
            type: 'ShortText',
            prompt: 'Are you 18 or older?',
            isRequired: true,
            displayOrder: 1,
            options: [],
            conditionalRule: {
              jump: [
                {
                  when: { all: [{ questionId: 'age', op: 'equals', value: 'No' }] },
                  target: { kind: 'ending', id: 'end-ko' },
                },
              ],
            },
          },
        ],
      },
    ],
    endScreens: [
      {
        id: 'end-ko',
        screenType: 'Ending',
        title: 'Not eligible',
        displayOrder: 1,
        isDisqualification: true,
        redirectURL: redirectUrl,
      },
      { id: 'end-ok', screenType: 'Ending', title: 'Thanks', displayOrder: 2, isDefault: true },
    ],
  } as unknown as PublishedFormDefinition;
}

async function submitKnockoutWithRedirect(redirectUrl: string) {
  const fake = makeFakeProvider({
    distribution: makeDistribution({ CaptchaRequired: false, MaxResponses: null, ResponseCount: 0 }),
    version: makeVersion(knockoutDefinitionRedirectingTo(redirectUrl)),
    createPermissions: respondentPermissions(),
  });
  const ctx: PipelineContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: `sess-ko-${Math.random().toString(36).slice(2)}`,
    clientIpHash: `ip-${Math.random().toString(36).slice(2)}`,
    fireHooks: async () => [],
  };
  return runSubmitPipeline(ctx, {
    distributionSlug: 'slug-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'age', textValue: 'No' }],
  });
}

describe('a DISQUALIFICATION screen redirect', () => {
  it('drops a javascript: scheme, exactly like the confirmation path', async () => {
    const result = await submitKnockoutWithRedirect('javascript:alert(1)');

    expect(result.status).toBe('Disqualified');
    expect(result.redirectUrl).toBeUndefined();
  });

  it('shows the screen copy instead, so a screened-out respondent is not left blank', async () => {
    const result = await submitKnockoutWithRedirect('javascript:alert(1)');

    expect(result.confirmationMessage).toBeTruthy();
  });

  it('still echoes a legitimate https redirect', async () => {
    const result = await submitKnockoutWithRedirect('https://example.com/not-eligible');

    expect(result.status).toBe('Disqualified');
    expect(result.redirectUrl).toBe('https://example.com/not-eligible');
  });

  it('still echoes a relative redirect', async () => {
    const result = await submitKnockoutWithRedirect('/not-eligible');

    expect(result.redirectUrl).toBe('/not-eligible');
  });
});
