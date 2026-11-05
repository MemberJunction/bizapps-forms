/**
 * The ending a respondent is shown — resolved here, on the server, and nowhere else (#303 Task 8).
 *
 * The respondent projection carries no ending screens (#302), so the widget can no longer pick one:
 * `Forms.SaveResponse` returns the screen, its copy and the redirect. Three cases, and each one is a
 * promise the server must not get wrong:
 *  - a COMPLETION gets the ending `resolveResponseOutcome` chose (or the form's confirmation);
 *  - a KNOCKOUT gets its own screen's copy and redirect — never the form-wide confirmation, which is
 *    a promise made to people who completed;
 *  - a REPEAT of a sealed screening whose answers no longer name a screen gets the neutral sentence.
 */
import {
  endingMessage,
  endingRedirectUrl,
  SCREENED_OUT_MESSAGE,
  type FormSettings,
  type PublishedFormScreen,
} from '@mj-biz-apps/forms-entities';
import { LogStatus } from '@memberjunction/core';
import type { RespondentEnding, RespondentSaveResult } from './save-request.js';

/** The ending part of a result. */
export type EndingFields = Pick<RespondentSaveResult, 'ending' | 'confirmationMessage' | 'redirectUrl'>;

/**
 * An author-configured redirect URL, or `undefined` when its scheme cannot be trusted.
 *
 * The widget follows the URL with `window.location.assign` on whatever site embeds it, so a
 * `javascript:` (or `data:`) URL here is script injection into the embedding page's origin. Any URL
 * that names a scheme must name http(s).
 *
 * A RELATIVE URL is passed through, deliberately more permissive than the widget: the server has no
 * base to resolve it against — only the client knows the embedding page — so "did not parse" here
 * means "relative", and the client, which CAN resolve it, makes the call. A string like `http://[`
 * is echoed here and refused by the widget; it cannot name a scheme, so it cannot execute.
 */
export function safeRedirectUrl(raw: string | undefined): string | undefined {
  const url = raw?.trim();
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      LogStatus(`[Forms] dropping an ending-screen redirect URL with a disallowed scheme (${parsed.protocol}).`);
      return undefined;
    }
  } catch {
    // No absolute scheme — a relative URL; see above for why it passes.
  }
  return url;
}

/**
 * What a COMPLETED response is shown: the resolved ending (when the form has one), its copy or the
 * form's confirmation message, and the redirect. A redirect and a confirmation message are
 * alternatives, not companions: sending both lets a client that ignores the redirect show a message
 * meant for a page nobody lands on.
 */
export function completionEnding(
  screen: PublishedFormScreen | undefined,
  settings: Pick<FormSettings, 'confirmationMessage' | 'redirectUrl'>,
): EndingFields {
  const redirectUrl = safeRedirectUrl(endingRedirectUrl(screen, settings));
  return {
    ending: screen ? toRespondentEnding(screen) : undefined,
    confirmationMessage: redirectUrl ? undefined : endingMessage(screen, settings),
    redirectUrl,
  };
}

/**
 * What a DISQUALIFIED respondent is shown: the knockout screen's own copy and redirect ONLY.
 * "Thanks, your response has been recorded" to someone who was screened out is untrue twice over.
 */
export function disqualificationEnding(screen: PublishedFormScreen): EndingFields {
  const redirectUrl = safeRedirectUrl(screen.redirectURL);
  const copy = [screen.title, screen.body].filter((t) => !!t?.trim()).join('\n\n');
  return {
    ending: toRespondentEnding(screen),
    confirmationMessage: redirectUrl ? undefined : copy || SCREENED_OUT_MESSAGE,
    redirectUrl,
  };
}

/**
 * What a repeat of an already-DISQUALIFIED response is shown: the knockout screen when this attempt
 * still trips it (the same answers re-sent), else the neutral sentence — never the form's
 * confirmation, because the row is `Disqualified`.
 */
export function sealedScreeningEnding(knockout: PublishedFormScreen | undefined): EndingFields {
  return knockout ? disqualificationEnding(knockout) : { confirmationMessage: SCREENED_OUT_MESSAGE };
}

/** A published screen as the respondent receives it: its content, never its condition. */
export function toRespondentEnding(screen: PublishedFormScreen): RespondentEnding {
  return {
    id: screen.id,
    title: screen.title,
    body: screen.body,
    buttonLabel: screen.buttonLabel,
    mediaURL: screen.mediaURL,
    redirectURL: safeRedirectUrl(screen.redirectURL),
    socialLinks: (screen.socialLinks ?? []).map((link) => ({ platform: link.platform, url: link.url })),
    isDisqualification: screen.isDisqualification === true,
  };
}
