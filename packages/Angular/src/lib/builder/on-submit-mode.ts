/**
 * Declaring that a form's own automations are what run on submit.
 *
 * Dispatch is all-or-nothing, and it used to be inferred from whether the automation list was
 * empty — which made "this form has never configured anything" and "this form deliberately runs
 * nothing" the same state. The builder therefore could not express the second one: an author who
 * removed their last step got all four legacy hooks back, silently, and a form created outside the
 * builder had no way to decline them at all (bizapps-forms#47).
 *
 * The decision lives here, pure, rather than inline in the Automate tab, because the tab uses
 * `inject()` and cannot be instantiated in this package's node test environment — inline, the only
 * available check would be a regex over its source, which cannot tell whether the settings it
 * writes are correct. Everything that matters about this operation is decidable from the settings
 * JSON alone, so this is the part worth testing and the tab keeps only the load/save around it.
 */
import type { FormSettings } from '@mj-biz-apps/forms-entities';
import { parseFormSettings, serializeFormSettings } from './json-fields';

/**
 * The `Form.Settings` JSON that marks this form's automations authoritative, or `null` when it
 * already is.
 *
 * `null` means "no write needed", not "failed" — every added step asks, and rewriting identical
 * settings each time is a wasted round-trip and a meaningless entry in the form's history.
 *
 * There is deliberately NO inverse. Nothing in the builder returns a form to the legacy list,
 * because that is the silent regression this exists to prevent: once an author has configured
 * their own on-submit steps, removing all of them means "run nothing", not "run the four I never
 * asked for".
 */
export function settingsUpdateToMarkAuthoritative(raw: string | null | undefined): string | null {
  const settings: FormSettings = parseFormSettings(raw);
  if (settings.onSubmitMode === 'Configured') {
    return null;
  }
  // Spread the PARSED settings, not the raw JSON: this replaces the whole blob, so anything not
  // carried forward here is destroyed — an author's quota or close date lost the first time they
  // add a step.
  return serializeFormSettings({ ...settings, onSubmitMode: 'Configured' });
}
