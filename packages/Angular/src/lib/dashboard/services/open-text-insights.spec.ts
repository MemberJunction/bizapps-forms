/**
 * What the written-answer panel says, and what it refuses to say.
 *
 * The refusal is the point: nothing here returns an answer. The tests that matter most are
 * the ones asserting that a theme counts PEOPLE rather than repetitions, and that a term one
 * person used is not a theme — those are what stop a single ranting answer from inventing a
 * pattern the reader then acts on.
 */
import { describe, expect, it } from 'vitest';
import { buildOpenTextInsights, buildThemes, termsIn } from './open-text-insights';
import { q, answer } from '../../shared/testing/entity-row-fixtures';

const long = q('qt', 'LongText', 0);
const label = () => 'Long text';

describe('termsIn', () => {
  it('drops filler words and very short tokens', () => {
    expect([...termsIn('The pricing was not very good for us')]).toEqual(['pricing']);
  });

  it('de-duplicates within one answer, so repetition cannot inflate a term', () => {
    expect([...termsIn('pricing pricing pricing')]).toEqual(['pricing']);
  });

  it('keeps accented words whole rather than splitting them into fragments', () => {
    expect([...termsIn('réservation problème')]).toEqual(['réservation', 'problème']);
  });

  it('ignores anything carrying a digit, which is an identifier and not a word', () => {
    // Live data produced themes reading "1970-01-01t00" and "000z" — one serialised
    // timestamp, tokenised into two things that looked like recurring vocabulary.
    expect([...termsIn('2026 2026 onboarding')]).toEqual(['onboarding']);
    expect([...termsIn('smoke check 1970-01-01T00:00:00.000Z')]).toEqual(['smoke', 'check']);
  });
});

describe('buildThemes', () => {
  it('counts the answers a term appeared in, not how often it was typed', () => {
    // One person writing "pricing" nine times is one person who mentioned pricing. Counting
    // occurrences would let a single answer manufacture a theme.
    const themes = buildThemes(['pricing pricing pricing pricing', 'pricing again']);
    expect(themes[0]).toMatchObject({ term: 'pricing', answers: 2 });
  });

  it('ignores a term only one person used', () => {
    // Where almost all of the noise lives.
    expect(buildThemes(['unique observation here', 'entirely different words'])).toEqual([]);
  });

  it('orders by how many people said it', () => {
    const themes = buildThemes([
      'pricing support',
      'pricing support',
      'pricing',
    ]);
    expect(themes.map((t) => t.term)).toEqual(['pricing', 'support']);
    expect(themes[0].answers).toBe(3);
    expect(themes[1].answers).toBe(2);
  });

  it('has nothing to say about no answers', () => {
    expect(buildThemes([])).toEqual([]);
  });
});

describe('which questions are mined for themes', () => {
  const short = q('qs', 'ShortText', 0);

  it('does not extract themes from short-answer fields', () => {
    // The live regression this prevents: word frequency over a "First name" field listed
    // real surnames with counts beside them — the exact exposure the redesign removed,
    // coming back through the themes list.
    const insight = buildOpenTextInsights(
      [short],
      [
        answer('r1', 'qs', { TextValue: 'Desai' }),
        answer('r2', 'qs', { TextValue: 'Desai' }),
      ],
      2,
      label,
    )[0];
    expect(insight.themes).toEqual([]);
    expect(insight.themesApply).toBe(false);
  });

  it('still extracts them from prose questions', () => {
    const insight = buildOpenTextInsights(
      [long],
      [
        answer('r1', 'qt', { TextValue: 'the pricing needs work' }),
        answer('r2', 'qt', { TextValue: 'pricing was confusing' }),
      ],
      2,
      label,
    )[0];
    expect(insight.themesApply).toBe(true);
    expect(insight.themes[0]).toMatchObject({ term: 'pricing', answers: 2 });
  });
});

describe('buildOpenTextInsights', () => {
  it('counts one answer per response, however many rows a question accumulated', () => {
    // Answers span every published version of a form, so a long-lived question can hold two
    // rows for one response. Reported as two, it produced "39 answered · 100%" on a form
    // with 32 responses.
    const insight = buildOpenTextInsights(
      [long],
      [
        answer('r1', 'qt', { TextValue: 'first version' }),
        answer('r1', 'qt', { TextValue: 'second version' }),
        answer('r2', 'qt', { TextValue: 'another' }),
      ],
      2,
      label,
    )[0];
    expect(insight.answered).toBe(2);
    expect(insight.responseRate).toBe(1);
  });

  it('reports the response rate against the response count, not the answer count', () => {
    const insight = buildOpenTextInsights(
      [long],
      [answer('r1', 'qt', { TextValue: 'something' })],
      4,
      label,
    )[0];
    expect(insight.answered).toBe(1);
    expect(insight.skipped).toBe(3);
    expect(insight.responseRate).toBe(0.25);
  });

  it('uses the median length, so one essay does not define "typical"', () => {
    const insight = buildOpenTextInsights(
      [long],
      [
        answer('r1', 'qt', { TextValue: 'ab' }),
        answer('r2', 'qt', { TextValue: 'abcd' }),
        answer('r3', 'qt', { TextValue: 'x'.repeat(4000) }),
      ],
      3,
      label,
    )[0];
    expect(insight.medianLength).toBe(4);
  });

  it('treats a whitespace-only answer as no answer', () => {
    const insight = buildOpenTextInsights(
      [long],
      [answer('r1', 'qt', { TextValue: '   ' }), answer('r2', 'qt', { TextValue: 'real' })],
      2,
      label,
    )[0];
    expect(insight.answered).toBe(1);
  });

  it('never reports more answers than there are responses', () => {
    // Answers span every published version while questions come from the latest, so a
    // long-lived question can out-count the responses being divided by.
    const insight = buildOpenTextInsights(
      [long],
      [answer('r1', 'qt', { TextValue: 'a' }), answer('r2', 'qt', { TextValue: 'b' })],
      1,
      label,
    )[0];
    expect(insight.responseRate).toBe(1);
    expect(insight.skipped).toBe(0);
  });

  it('returns no answer text anywhere in the model', () => {
    // The panel summarises; the Responses view quotes. A verbatim leaking into this shape
    // is the defect the whole redesign removed.
    const insight = buildOpenTextInsights(
      [long],
      [answer('r1', 'qt', { TextValue: 'my secret confidential sentence' })],
      1,
      label,
    )[0];
    expect(JSON.stringify(insight)).not.toContain('my secret confidential sentence');
  });

  it('has a defined shape when nobody answered', () => {
    const insight = buildOpenTextInsights([long], [], 5, label)[0];
    expect(insight.answered).toBe(0);
    expect(insight.medianLength).toBeNull();
    expect(insight.themes).toEqual([]);
    expect(insight.responseRate).toBe(0);
  });
});
