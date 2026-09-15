import { describe, it, expect } from 'vitest';
import { CAPTCHA_NOT_CONFIGURED_MESSAGE, type PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

import {
  canRenderChallenge,
  canSubmit,
  captchaRequired,
  isConfigGap,
  isSiteKeyConfigured,
  isTurnstileError,
} from './turnstile-gate';

/** Minimal published-form factory toggling only the captcha flag. */
function def(captcha: boolean): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Test',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: captcha },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [],
    pages: [],
  };
}

const KEY = '0x4AAAAAAA_test';

describe('captchaRequired', () => {
  it('is false for a null definition or captcha-off form', () => {
    expect(captchaRequired(null)).toBe(false);
    expect(captchaRequired(def(false))).toBe(false);
  });
  it('is true only when the form has captcha on', () => {
    expect(captchaRequired(def(true))).toBe(true);
  });
});

describe('isSiteKeyConfigured', () => {
  it('treats undefined / blank as unconfigured', () => {
    expect(isSiteKeyConfigured(undefined)).toBe(false);
    expect(isSiteKeyConfigured('')).toBe(false);
    expect(isSiteKeyConfigured('   ')).toBe(false);
  });
  it('treats a non-blank string as configured', () => {
    expect(isSiteKeyConfigured(KEY)).toBe(true);
  });
});

describe('canRenderChallenge / isConfigGap', () => {
  it('renders only when captcha is on AND a key is present', () => {
    expect(canRenderChallenge(def(true), KEY)).toBe(true);
    expect(canRenderChallenge(def(true), undefined)).toBe(false);
    expect(canRenderChallenge(def(false), KEY)).toBe(false);
  });
  it('flags a config gap when captcha is on but the key is missing', () => {
    expect(isConfigGap(def(true), undefined)).toBe(true);
    expect(isConfigGap(def(true), KEY)).toBe(false);
    expect(isConfigGap(def(false), undefined)).toBe(false);
  });
});

describe('canSubmit — the gate', () => {
  it('always allows submit when captcha is NOT required (unchanged behavior)', () => {
    expect(canSubmit(def(false), undefined, null)).toBe(true);
    expect(canSubmit(null, undefined, null)).toBe(true);
    expect(canSubmit(def(false), KEY, null)).toBe(true);
  });

  it('blocks submit when captcha is required and no token is held', () => {
    expect(canSubmit(def(true), KEY, null)).toBe(false);
    expect(canSubmit(def(true), KEY, '')).toBe(false);
    expect(canSubmit(def(true), KEY, '   ')).toBe(false);
  });

  it('allows submit once a solved token is held', () => {
    expect(canSubmit(def(true), KEY, 'solved-token')).toBe(true);
  });

  it('blocks submit when captcha is required but the site key is missing (config gap)', () => {
    expect(canSubmit(def(true), undefined, 'solved-token')).toBe(false);
    expect(canSubmit(def(true), undefined, null)).toBe(false);
  });
});

describe('isTurnstileError — reset trigger', () => {
  it('detects the server captcha failure message', () => {
    expect(isTurnstileError('Captcha verification failed (missing-token).')).toBe(true);
    expect(isTurnstileError('Captcha verification failed (timeout-or-duplicate).')).toBe(true);
  });
  it('detects raw Turnstile error codes', () => {
    expect(isTurnstileError('missing-token')).toBe(true);
    expect(isTurnstileError('verification-failed')).toBe(true);
  });
  // #122/#134. The server's config-gap refusal IS a Turnstile outcome — it is what
  // `turnstile-not-configured` became once it stopped blaming the respondent. It reached the widget
  // as prose containing neither the word "captcha" nor any code, so this classifier stopped
  // recognising it and the spent single-use token was left un-cleared. The message is now one
  // shared constant, so the two surfaces cannot drift apart again.
  it('detects the server config-gap refusal, which carries no error code', () => {
    expect(isTurnstileError(CAPTCHA_NOT_CONFIGURED_MESSAGE)).toBe(true);
  });

  // The widget does not hand this function one error — it hands it every error joined:
  // `(res.errors ?? []).map((e) => e.message).join(' ')` (mj-form.component). An identity
  // comparison would therefore hold only while the server happens to return exactly one, which is
  // a property of today's `fail(message)` call and not of the contract. Matching the sentence
  // inside the joined string is what actually survives a second error appearing beside it.
  it('detects the config-gap refusal even when it is joined with another error', () => {
    const joined = `Something else went wrong. ${CAPTCHA_NOT_CONFIGURED_MESSAGE}`;
    expect(isTurnstileError(joined)).toBe(true);
  });

  it('does not misfire on unrelated errors or empty input', () => {
    expect(isTurnstileError(undefined)).toBe(false);
    expect(isTurnstileError(null)).toBe(false);
    expect(isTurnstileError('Please answer all required questions.')).toBe(false);
    expect(isTurnstileError('Response quota reached.')).toBe(false);
  });
});
