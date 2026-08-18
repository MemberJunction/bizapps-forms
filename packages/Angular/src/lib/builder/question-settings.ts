/**
 * Which per-type settings the properties panel offers, declared rather than branched.
 *
 * `PublishedFormQuestion.settings` is an open JSON blob by design — it is where genuinely
 * per-type configuration lives (a rating's maximum, an opinion scale's end labels, a legal
 * question's terms) without giving every type its own column. The cost of an open blob is that
 * nothing tells an AUTHOR what may go in it, so before this the widget read settings that the
 * builder gave no way to write: `Rating` honoured `settings.max` and the panel had no field for
 * it, so every rating on every form was stuck at five stars.
 *
 * This table closes that gap and is the contract between the two. A key here with no reader in
 * the widget is a field that does nothing; a key the widget reads that is missing here is a
 * capability with no way to reach it. Both are worth checking when either side changes.
 */
import type { FormQuestionType, JSONValue } from '@mj-biz-apps/forms-entities';

/** How one setting is edited. */
export type SettingKind = 'text' | 'number' | 'multiline';

/** One editable setting on a question. */
export interface QuestionSettingField {
  /** The key inside `FormQuestion.Settings`. Must match what the widget reads. */
  key: string;
  label: string;
  kind: SettingKind;
  placeholder?: string;
  /** One-line explanation shown under the control. */
  hint?: string;
}

const PLACEHOLDER: QuestionSettingField = {
  key: 'placeholder',
  label: 'Placeholder',
  kind: 'text',
  placeholder: 'Shown in the empty field',
};

/**
 * Settings per type. Types absent from this map have none, which is most of them —
 * an omission here means "nothing to configure", not "not done yet".
 */
const SETTINGS: Partial<Record<FormQuestionType, readonly QuestionSettingField[]>> = {
  ShortText: [PLACEHOLDER],
  Email: [PLACEHOLDER],
  Phone: [PLACEHOLDER],
  Website: [PLACEHOLDER],
  Number: [PLACEHOLDER],
  LongText: [
    PLACEHOLDER,
    { key: 'rows', label: 'Height (rows)', kind: 'number', hint: 'How tall the box starts. Default 4.' },
  ],
  Rating: [
    { key: 'max', label: 'Number of stars', kind: 'number', hint: 'Default 5.' },
  ],
  OpinionScale: [
    { key: 'min', label: 'Lowest value', kind: 'number', hint: 'Default 1. Use 0 for a zero-based scale.' },
    { key: 'max', label: 'Highest value', kind: 'number', hint: 'Default 10.' },
    { key: 'labelMin', label: 'Label at the low end', kind: 'text', placeholder: 'Not at all' },
    { key: 'labelMax', label: 'Label at the high end', kind: 'text', placeholder: 'Extremely' },
  ],
  Legal: [
    {
      key: 'terms',
      label: 'Terms',
      kind: 'multiline',
      hint: 'Shown in a scrollable box above Accept / Decline.',
    },
  ],
  Checkbox: [
    {
      key: 'placeholder',
      label: 'Checkbox label',
      kind: 'text',
      placeholder: 'I agree',
      hint: 'The text beside the box. The prompt above stays as the question.',
    },
  ],
  FileUpload: [
    {
      key: 'accept',
      label: 'Accepted file types',
      kind: 'text',
      placeholder: 'image/*,.pdf',
      hint: 'A browser accept list. Blank allows anything the server permits.',
    },
  ],
};

/** The settings a type offers, in display order. Empty for types with none. */
export function settingsFor(type: FormQuestionType): readonly QuestionSettingField[] {
  return SETTINGS[type] ?? [];
}

/** Read one setting as the string an `<input>` shows. */
export function settingText(settings: Record<string, JSONValue>, key: string): string {
  const raw = settings[key];
  if (typeof raw === 'string') {
    return raw;
  }
  return typeof raw === 'number' ? String(raw) : '';
}

/**
 * Write one setting, returning the new map.
 *
 * A blank value DELETES the key rather than storing `''` or `0`. That distinction is load-bearing
 * for the numeric settings: the widget's defaults (`5` stars, a `1..10` scale) apply only when
 * the key is ABSENT, so an author who clears the field to "go back to the default" would
 * otherwise pin it to zero — and a zero-star rating renders nothing to click.
 */
export function withSetting(
  settings: Record<string, JSONValue>,
  field: QuestionSettingField,
  raw: string,
): Record<string, JSONValue> {
  const next = { ...settings };
  const trimmed = raw.trim();
  if (trimmed === '') {
    delete next[field.key];
    return next;
  }
  if (field.kind === 'number') {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      // Not a number: leave the stored value alone rather than writing NaN, which JSON
      // serializes as `null` and the widget then reads as "unset" one render later.
      return settings;
    }
    next[field.key] = parsed;
    return next;
  }
  next[field.key] = raw;
  return next;
}
