/**
 * The two summary sections built from identity, attachment and written answers — values the server
 * reads and the caller never sees. Each rule ported from forms-ng (`respondent-profile.ts`,
 * `open-text-insights.ts`) is pinned, and so is the guarantee that matters most: no email address,
 * phone number, street, name or written answer appears anywhere in what the section returns.
 */
import { describe, expect, it } from 'vitest';
import { buildRespondentProfile } from '../profile.js';
import { buildOpenTextInsights } from '../open-text.js';
import { insightAnswer, question } from './reporting-fixtures.js';

const email = question('q-email', 'Email', 'Email');
const phone = question('q-phone', 'Phone', 'Phone');
const address = question('q-addr', 'Address', 'Address');
const contact = question('q-contact', 'ContactInfo', 'Contact');
const upload = question('q-file', 'FileUpload', 'CV');

describe('buildRespondentProfile', () => {
  it('counts contactable RESPONSES once across two email questions, and distinct people and repeats', () => {
    const answers = [
      insightAnswer('r1', 'q-email', { TextValue: 'Ada@Example.org' }),
      insightAnswer('r1', 'q-contact', { JSONValue: JSON.stringify({ email: 'ada@example.org', phone: '0770 900' }) }),
      insightAnswer('r2', 'q-email', { TextValue: 'ada@example.org' }),
      insightAnswer('r3', 'q-email', { TextValue: 'bob@gmail.com' }),
      insightAnswer('r4', 'q-email', { TextValue: 'not an email' }),
    ];
    const profile = buildRespondentProfile([email, contact], answers, 5);

    expect(profile.IsEmpty).toBe(false);
    expect(profile.Metrics).toEqual([
      { Label: 'Contactable', Value: '3', Detail: 'of 5 responses gave an email', Fraction: 3 / 5 },
      { Label: 'Distinct people', Value: '2', Detail: '1 submitted more than once', Fraction: null },
      { Label: 'Work addresses', Value: '50%', Detail: 'not a known consumer mailbox', Fraction: 0.5 },
      { Label: 'Phone given', Value: '1', Detail: 'of 5 responses', Fraction: 1 / 5 },
    ]);
    expect(profile.Distributions[0].Title).toBe('Email domains');
    expect(profile.Distributions[0].Buckets).toEqual([
      { Label: 'example.org', Count: 3, Fraction: 0.75 },
      { Label: 'gmail.com', Count: 1, Fraction: 0.25 },
    ]);
  });

  it('folds countries and organisations past the top six into "Other (n more)", only when that saves a row', () => {
    const countries = ['UK', 'UK', 'FR', 'DE', 'ES', 'IT', 'PT', 'NL', 'BE'];
    const answers = countries.map((c, i) => insightAnswer(`r${i}`, 'q-addr', { JSONValue: JSON.stringify({ city: 'X', country: c }) }));
    const profile = buildRespondentProfile([address], answers, 9);

    const buckets = profile.Distributions.find((d) => d.Title === 'Countries')?.Buckets ?? [];
    expect(buckets.map((b) => b.Label)).toEqual(['UK', 'BE', 'DE', 'ES', 'FR', 'IT', 'Other (2 more)']);
    expect(buckets[6]).toEqual({ Label: 'Other (2 more)', Count: 2, Fraction: 2 / 9 });
    expect(profile.Metrics).toEqual([{ Label: 'Address given', Value: '9', Detail: 'of 9 responses', Fraction: 1 }]);
  });

  it('clamps a coverage figure at the response count, and counts files by response', () => {
    const answers = [insightAnswer('r1', 'q-file', { FileID: 'f1' }), insightAnswer('r2', 'q-file', { FileID: 'f2' }), insightAnswer('r3', 'q-file', { FileID: 'f3' })];

    expect(buildRespondentProfile([upload], answers, 2).Metrics).toEqual([{ Label: 'Files attached', Value: '2', Detail: 'of 2 responses', Fraction: 1 }]);
  });

  it('is empty only when the form asks nothing that profiles a respondent', () => {
    expect(buildRespondentProfile([question('q-x', 'YesNo')], [], 0).IsEmpty).toBe(true);
    expect(buildRespondentProfile([email], [], 0)).toEqual({ IsEmpty: false, Metrics: [], Distributions: [] });
  });

  it('returns no email local part, phone number or street anywhere', () => {
    const answers = [
      insightAnswer('r1', 'q-email', { TextValue: 'ada.lovelace@example.org' }),
      insightAnswer('r1', 'q-phone', { TextValue: '+44 7700 900123' }),
      insightAnswer('r1', 'q-addr', { JSONValue: JSON.stringify({ line1: '12 Analytical Row', country: 'UK' }) }),
    ];
    const shipped = JSON.stringify(buildRespondentProfile([email, phone, address], answers, 1));

    expect(shipped).not.toContain('ada.lovelace');
    expect(shipped).not.toContain('7700');
    expect(shipped).not.toContain('Analytical');
  });
});

describe('buildOpenTextInsights', () => {
  const essay = question('q-essay', 'LongText', 'Tell us more');
  const name = question('q-name', 'ShortText', 'First name');

  it('counts answers once per response, clamps skipped at zero, and rounds the median length', () => {
    const answers = [
      insightAnswer('r1', 'q-essay', { TextValue: 'pricing was confusing' }),
      insightAnswer('r1', 'q-essay', { TextValue: 'a duplicate row for r1' }),
      insightAnswer('r2', 'q-essay', { TextValue: 'pricing page' }),
      insightAnswer('r3', 'q-essay', { TextValue: '   ' }),
    ];
    const [insight] = buildOpenTextInsights([essay], answers, 3);

    expect(insight).toMatchObject({ QuestionID: 'q-essay', Prompt: 'Tell us more', QuestionType: 'LongText', Answered: 2, Skipped: 1, ResponseRate: 2 / 3, ThemesApply: true });
    expect(insight.MedianLength).toBe(Math.round(('pricing was confusing'.length + 'pricing page'.length) / 2));
    expect(insight.Themes).toEqual([{ Term: 'pricing', Answers: 2, Fraction: 1 }]);
    expect(buildOpenTextInsights([essay], answers, 1)[0]).toMatchObject({ Skipped: 0, ResponseRate: 1 });
    expect(buildOpenTextInsights([essay], [], 0)[0]).toMatchObject({ Answered: 0, ResponseRate: null, MedianLength: null });
  });

  it('never mines a ShortText for themes, so names do not become terms', () => {
    const answers = ['Desai', 'Desai', 'Smith'].map((n, i) => insightAnswer(`r${i}`, 'q-name', { TextValue: n }));
    const [insight] = buildOpenTextInsights([name], answers, 3);

    expect(insight).toMatchObject({ Answered: 3, ThemesApply: false, Themes: [] });
    expect(JSON.stringify(insight)).not.toMatch(/desai|smith/i);
  });

  it('keeps at most eight themes of at least two answers each, skipping stopwords and anything with a digit', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'];
    const answers = [0, 1].map((i) => insightAnswer(`r${i}`, 'q-essay', { TextValue: `${words.join(' ')} the 2026 abc123 solo${i}` }));
    const [insight] = buildOpenTextInsights([essay], answers, 2);

    expect(insight.Themes.map((t) => t.Term)).toEqual(words.slice(0, 8));
  });
});
