import { describe, expect, it } from 'vitest';
import { settingsUpdateToMarkAuthoritative } from './on-submit-dispatch';
import { readStoredFormSettings } from './stored-columns';
import type { FormSettings } from './form-definition';

/** How the builder writes settings: the whole object, as JSON. */
const serializeFormSettings = (settings: FormSettings): string => JSON.stringify(settings);

/** The settings a written blob reads back as — through the same reader publish uses. */
function parseFormSettings(raw: string | null): FormSettings {
  const read = readStoredFormSettings(raw);
  if (!read.ok) {
    throw new Error(`settings did not read back: ${read.reason}`);
  }
  return read.value;
}

/**
 * Marking a form's automations authoritative is what stops the four legacy hooks coming back.
 *
 * Two failures made this necessary (bizapps-forms#47). A form created programmatically inherited
 * the legacy list with no way to decline it. And in the builder, removing the last step published
 * an empty array — indistinguishable from "never configured" — so the confirmation email,
 * follow-up task, respondent-Person upsert and answer scoring all silently returned.
 */
describe('settingsUpdateToMarkAuthoritative', () => {
  it('declares a form authoritative the first time it is asked', () => {
    const raw = serializeFormSettings({ anonymousAllowed: true, captchaRequired: false });

    const updated = settingsUpdateToMarkAuthoritative(raw);

    expect(updated).not.toBeNull();
    expect(parseFormSettings(updated).onSubmitMode).toBe('Configured');
  });

  it('reports no update needed when the form already says so', () => {
    // Every added step asks. Rewriting identical settings on each one is a wasted round-trip and a
    // pointless entry in the form's change history.
    const raw = serializeFormSettings({
      anonymousAllowed: true,
      captchaRequired: false,
      onSubmitMode: 'Configured',
    });

    expect(settingsUpdateToMarkAuthoritative(raw)).toBeNull();
  });

  it('leaves every other setting untouched', () => {
    // This writes the whole Settings blob back, so anything it drops is destroyed — a quota or a
    // close date silently lost the first time an author adds an automation.
    const raw = serializeFormSettings({
      anonymousAllowed: false,
      captchaRequired: true,
      quota: 100,
      closesAt: '2026-12-31T00:00:00.000Z',
      confirmationMessage: 'Thanks!',
      redirectUrl: 'https://example.test/done',
    });

    const settings = parseFormSettings(settingsUpdateToMarkAuthoritative(raw));

    expect(settings.anonymousAllowed).toBe(false);
    expect(settings.captchaRequired).toBe(true);
    expect(settings.quota).toBe(100);
    expect(settings.closesAt).toBe('2026-12-31T00:00:00.000Z');
    expect(settings.confirmationMessage).toBe('Thanks!');
    expect(settings.redirectUrl).toBe('https://example.test/done');
    expect(settings.onSubmitMode).toBe('Configured');
  });

  it('handles a form whose settings have never been written', () => {
    // `Form.Settings` is nullable and a form created outside the builder may never have had one.
    expect(parseFormSettings(settingsUpdateToMarkAuthoritative(null)).onSubmitMode).toBe('Configured');
  });

  it('upgrades a form that was explicitly on the legacy list', () => {
    const raw = serializeFormSettings({
      anonymousAllowed: true,
      captchaRequired: false,
      onSubmitMode: 'Legacy',
    });

    expect(parseFormSettings(settingsUpdateToMarkAuthoritative(raw)).onSubmitMode).toBe('Configured');
  });

  it('refuses to rewrite settings it cannot read, rather than replacing them with what it could', () => {
    // This writes the WHOLE blob back. The tolerant parser it used to call cast a mistyped value
    // straight through; a validating reader that defaulted instead would silently replace an
    // author's settings with the defaults the first time they added a step. Refusing is the only
    // option that loses nothing — the Automate tab surfaces the message and abandons the add.
    expect(() => settingsUpdateToMarkAuthoritative('{"quota":"fifty"}')).toThrow(/settings cannot be read.*quota/);
    expect(() => settingsUpdateToMarkAuthoritative('{oops')).toThrow(/settings cannot be read/);
  });
});
