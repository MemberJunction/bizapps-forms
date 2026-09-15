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
import {
  DOODLE_PEN_COLORS,
  DOODLE_PEN_CONTROL_CHOICES,
  DOODLE_PEN_DEFAULTS,
  DOODLE_PEN_WIDTH_NAMES,
  type FormQuestionType,
  type JSONValue,
} from '@mj-biz-apps/forms-entities';

/**
 * How one setting is edited.
 *
 * `choice` is a closed list rendered as a `<select>`, and it exists because a free text box for a
 * value the widget validates against a fixed set is a trap: the author types `blue`, the widget
 * accepts only `Blue`, and the fallback is silent by design. Offering the list makes the two
 * agree by construction — the options come FROM the same contract the widget validates against.
 */
export type SettingKind = 'text' | 'number' | 'multiline' | 'choice';

/** One editable setting on a question. */
export interface QuestionSettingField {
  /** The key inside `FormQuestion.Settings`. Must match what the widget reads. */
  key: string;
  label: string;
  kind: SettingKind;
  placeholder?: string;
  /** One-line explanation shown under the control. */
  hint?: string;
  /**
   * `choice` only: the values on offer, in display order.
   *
   * An empty-string value is the "leave it to the default" option, which `withSetting` then
   * deletes rather than storing — the same blank-means-default rule the text fields follow.
   */
  choices?: readonly { readonly value: string; readonly label: string }[];
}

/**
 * Turn a contract's value tuple into `choice` options, ALWAYS with a named blank at the front.
 *
 * The blank is not optional and not conditional on the tuple containing one. It is the row's
 * "leave it to the default" option, and it carries two jobs: `withSetting` deletes the key when
 * it is picked (so the widget's own default applies), and its LABEL is the only place the panel
 * tells the author what that default is. A list with no blank cannot be cleared once set, and —
 * worse — renders the first value as though it were the default, so the panel says `Fine` over a
 * pad that draws `Medium`.
 *
 * Values equal to the blank are dropped, so a tuple that already carries `''` does not produce a
 * duplicate. Pass `values` WITHOUT the default's own name: the blank already means it, and two
 * entries with one outcome is a choice that is not a choice.
 */
function choicesOf(values: readonly string[], blankLabel: string): QuestionSettingField['choices'] {
  return [
    { value: '', label: blankLabel },
    ...values.filter((value) => value !== '').map((value) => ({ value, label: value })),
  ];
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
  // Every option comes from the contract the widget validates against, so the panel cannot offer
  // a pen the pad would silently fall back on. All three default to blank, which is deleted —
  // an author who touches none of them gets the pad exactly as it has always behaved.
  Doodle: [
    {
      key: 'penColor',
      label: 'Pen colour',
      kind: 'choice',
      choices: choicesOf(
        DOODLE_PEN_COLORS.filter((c) => c !== DOODLE_PEN_DEFAULTS.color),
        `${DOODLE_PEN_DEFAULTS.color} — follow the form’s text colour`,
      ),
      hint: 'The colour a drawing starts in. Every pen is mixed toward the form’s text colour so it stays legible on any background.',
    },
    {
      key: 'penWidth',
      label: 'Stroke width',
      kind: 'choice',
      choices: choicesOf(
        DOODLE_PEN_WIDTH_NAMES.filter((w) => w !== DOODLE_PEN_DEFAULTS.width),
        `${DOODLE_PEN_DEFAULTS.width} (default)`,
      ),
      hint: 'How thick a drawing starts.',
    },
    {
      key: 'penControls',
      label: 'Respondent can change',
      kind: 'choice',
      choices: choicesOf(DOODLE_PEN_CONTROL_CHOICES, 'Nothing'),
      hint: 'Which pen controls appear on the pad. Undo and Clear are always available.',
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
