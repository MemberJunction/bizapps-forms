/**
 * Which ending screen a finished response gets, and what a screen falls back to.
 *
 * Shared rather than implemented in the widget, because the SERVER decides too: the submit
 * mutation returns the `redirectUrl` of the ending that won, and a respondent who is
 * redirected never renders a screen at all. Two implementations of "which ending applies"
 * would let a form redirect to one ending's URL while showing another's copy.
 */
import { evaluateConditionalRule, type AnswerValue, type EvalExtras } from './conditional-rule';
import type { FormSettings, PublishedFormScreen } from './form-definition';

/**
 * Pick the ending screen for a completed response.
 *
 * Resolution runs in three passes, and the split exists because
 * {@link evaluateConditionalRule} answers a different question than this one does. There,
 * "no rule" means ALWAYS VISIBLE — correct for a page, which is shown unless something hides
 * it. Here it would mean the first unconditional ending swallows every response before any
 * conditional ending is consulted, which is the opposite of what an author who wrote those
 * conditions asked for. So:
 *
 * 1. **Conditional endings**, in display order — the first whose rule the answers satisfy.
 * 2. **The explicit default**, if the author marked one.
 * 3. **The first unconditional ending** — an author with a single plain ending and no
 *    `isDefault` flag plainly meant it to show.
 *
 * `undefined` means the form configured no usable ending; the caller falls back to
 * {@link FormSettings.confirmationMessage}, which is what every form published before ending
 * screens existed relies on.
 */
export function resolveEndingScreen(
  endScreens: readonly PublishedFormScreen[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): PublishedFormScreen | undefined {
  // Disqualification screens never compete here. A screened-out screen is a destination a
  // `Go to` rule SENDS someone to, not one anybody reaches by finishing the form, so letting one
  // win the conditional arm — or, worse, become the `isDefault` fallback — would screen out
  // every respondent who simply completed the form.
  const ordered = [...endScreens]
    .filter((s) => s.isDisqualification !== true)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const conditionalMatch = ordered.find(
    (s) => s.conditionalRule !== undefined && evaluateConditionalRule(s.conditionalRule, answers, extras),
  );
  if (conditionalMatch) {
    return conditionalMatch;
  }

  return ordered.find((s) => s.isDefault) ?? ordered.find((s) => s.conditionalRule === undefined);
}

/**
 * What a screened-out respondent is told when nothing more specific applies.
 *
 * Shared, because both ends need it and they must not drift: the server answers the mutation with
 * it, and the widget needs it for the case where the server sent a REDIRECT instead of a message
 * (it sends one or the other, never both) and the page is briefly on screen anyway. Deliberately
 * not a thank-you for a completion — "your response has been recorded" is untrue of a knockout on
 * both counts, and it is the sentence a respondent is most likely to quote back.
 */
export const SCREENED_OUT_MESSAGE = 'Thanks for your time.';

/**
 * The message a respondent sees after submitting: the resolved ending's copy, else the
 * form-wide confirmation message, else a neutral default.
 *
 * The neutral default is deliberate and not a placeholder to be removed. A form whose author
 * configured neither still has to say something after a submit, and a blank confirmation
 * reads as a failure — which is exactly the "success but no thank-you screen" bug the widget's
 * phase machine already guards against on the other side.
 */
export function endingMessage(
  screen: PublishedFormScreen | undefined,
  settings: Pick<FormSettings, 'confirmationMessage'>,
): string {
  const fromScreen = screen ? [screen.title, screen.body].filter((t) => !!t?.trim()).join('\n\n') : '';
  return fromScreen || settings.confirmationMessage?.trim() || 'Thanks — your response has been recorded.';
}

/**
 * Where to send the respondent after a successful submit, or `undefined` to show a screen.
 *
 * The winning ending's own URL beats the form-wide one, so an author can redirect qualified
 * respondents to a booking page while everyone else sees a thank-you.
 */
export function endingRedirectUrl(
  screen: PublishedFormScreen | undefined,
  settings: Pick<FormSettings, 'redirectUrl'>,
): string | undefined {
  const url = screen?.redirectURL?.trim() || settings.redirectUrl?.trim();
  return url || undefined;
}
