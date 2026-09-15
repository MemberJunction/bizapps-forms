/**
 * The global per-answer size ceiling, and the client-metadata cap beside it.
 *
 * Both are hard abuse bounds rather than product knobs: `FormResponseAnswer.TextValue` is
 * `NVARCHAR(MAX)`, the widget sets no `maxlength`, and before these existed a question with no
 * `validationRule` — the common case — was bounded only by MJAPI's 50mb GraphQL body limit, on
 * the DRAFT path as well as the complete one. The draft coverage is the part worth being explicit
 * about: an autosave persists a row exactly like a completion does, so a ceiling that waived
 * drafts would bound nothing an abuser cares about.
 */
import { describe, expect, it } from 'vitest';

import { MAX_ANSWER_VALUE_BYTES, validateSubmission, type ValidationMode } from '../validation.service';
import { MAX_CLIENT_META_CHARS, buildSourceMetadata } from '../source-metadata.service';
import type { ClientMeta, FormAnswerInput, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

/** The two identifiers `buildSourceMetadata` always needs; irrelevant to the cap under test. */
const META_IDS = { sessionId: 'sess-1', distributionId: 'dist-1' } as const;

/** Build the stored metadata blob for one `clientMeta`, with the required ids supplied. */
const metaFor = (clientMeta: ClientMeta) => buildSourceMetadata({ ...META_IDS, clientMeta });

const question = (id: string, type = 'ShortText') => ({
  id,
  type,
  prompt: `Question ${id}`,
  isRequired: false,
  displayOrder: 0,
  settings: {},
  options: [],
});

const definition = {
  formId: 'f1',
  formVersionId: 'v1',
  name: 'size ceiling fixture',
  renderMode: 'Scroll',
  settings: { anonymousAllowed: true, captchaRequired: false },
  styleTokens: {},
  automations: [],
  endScreens: [],
  pages: [
    {
      id: 'p1',
      title: 'Page',
      displayOrder: 0,
      questions: [question('q1'), question('q2', 'MultiChoice')],
    },
  ],
} as unknown as PublishedFormDefinition;

/**
 * Just the oversize errors, so an unrelated validation message cannot make a test pass.
 *
 * `FieldError.questionId` is optional (a form-level error carries none), so the element type is
 * `string | undefined` rather than `string` — kept honest instead of asserted away, since a
 * ceiling error that arrived WITHOUT a question id would be a real defect and these tests should
 * be able to see it.
 */
function oversizeErrors(
  answers: FormAnswerInput[],
  mode: ValidationMode = 'complete',
): Array<string | undefined> {
  return validateSubmission(definition, answers, mode)
    .errors.filter((e) => /too large/i.test(e.message))
    .map((e) => e.questionId);
}

describe('the global answer-size ceiling', () => {
  it('is 64KB', () => {
    expect(MAX_ANSWER_VALUE_BYTES).toBe(64 * 1024);
  });

  it('accepts an answer of exactly the ceiling', () => {
    // The bound is `>`, not `>=`: an answer AT the limit is legal. Pinned because flipping the
    // comparison is a one-character change that no other test would notice.
    expect(oversizeErrors([{ questionId: 'q1', textValue: 'a'.repeat(MAX_ANSWER_VALUE_BYTES) }])).toEqual([]);
  });

  it('refuses an answer one byte over the ceiling', () => {
    expect(oversizeErrors([{ questionId: 'q1', textValue: 'a'.repeat(MAX_ANSWER_VALUE_BYTES + 1) }])).toEqual(['q1']);
  });

  it('measures UTF-8 BYTES, not UTF-16 code units', () => {
    // 20k four-byte emoji: 40k code units (comfortably under any char-based cap) but 80k bytes.
    // A `.length` implementation would accept this and store 80KB.
    const emoji = '\u{1F600}'.repeat(20000);
    expect(emoji.length).toBeLessThan(MAX_ANSWER_VALUE_BYTES);
    expect(oversizeErrors([{ questionId: 'q1', textValue: emoji }])).toEqual(['q1']);
  });

  it('measures a JSON answer too, not only a text one', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `option-value-number-${i}-padding-padding`);
    expect(oversizeErrors([{ questionId: 'q2', jsonValue: big }])).toEqual(['q2']);
  });

  it.each<ValidationMode>(['complete', 'draft', 'screened-out'])(
    'holds in %s mode — an autosave persists a row just like a completion does',
    (mode) => {
      expect(oversizeErrors([{ questionId: 'q1', textValue: 'a'.repeat(70000) }], mode)).toEqual(['q1']);
    },
  );

  it('names every oversized answer, not just the first', () => {
    const errors = oversizeErrors([
      { questionId: 'q1', textValue: 'a'.repeat(70000) },
      { questionId: 'q2', jsonValue: [('b'.repeat(70000))] },
    ]);
    expect(errors.sort()).toEqual(['q1', 'q2']);
  });

  it('leaves an ordinary answer alone', () => {
    expect(oversizeErrors([{ questionId: 'q1', textValue: 'a normal typed answer' }])).toEqual([]);
  });

  it('tells the respondent the SAME number the ceiling actually is', () => {
    // The message used to spell "64KB" as a literal beside the constant that also meant 64KB.
    // Deriving it from the bound is only worth anything if something checks the two agree.
    const [error] = validateSubmission(
      definition,
      [{ questionId: 'q1', textValue: 'a'.repeat(MAX_ANSWER_VALUE_BYTES + 1) }],
      'complete',
    ).errors;

    expect(error.message).toContain(`${MAX_ANSWER_VALUE_BYTES / 1024}KB`);
  });
});

describe('the client-metadata cap', () => {
  const ua = (value: string | undefined) => metaFor({ userAgent: value }).userAgent;

  it('is 2048 characters', () => {
    expect(MAX_CLIENT_META_CHARS).toBe(2048);
  });

  it('stores a real-length user agent untouched', () => {
    const real = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    expect(ua(real)).toBe(real);
  });

  it('truncates rather than refusing, because the metadata is diagnostic and the answers are not', () => {
    // The asymmetry with the answer ceiling above is deliberate: refusing a whole submission over
    // a padded user-agent string would cost the respondent's answers, which are the irreplaceable
    // part. A clipped value still identifies the browser.
    expect(ua('u'.repeat(5000))).toHaveLength(MAX_CLIENT_META_CHARS);
  });

  it('truncates the referrer on the same bound', () => {
    const meta = metaFor({ referrer: 'r'.repeat(5000) });
    expect(meta.referrer).toHaveLength(MAX_CLIENT_META_CHARS);
  });

  it('omits a blank value instead of storing an empty string', () => {
    expect(ua('   ')).toBeUndefined();
    expect(ua(undefined)).toBeUndefined();
  });
});
