/**
 * What can be said about written answers WITHOUT quoting them.
 *
 * Verbatims are reading, not analysis, and they belong to the Responses view where each one
 * has a person and a submission time attached. Reproduced on a dashboard they are worse than
 * useless: three arbitrary answers out of forty tell you nothing about the forty, and when
 * the question happens to be "First name" they are a list of real people on a screen someone
 * left open in a meeting.
 *
 * What survives the removal of the values is genuinely more informative:
 *
 *   - RESPONSE RATE. An optional written question that 12% of people answer is a finding
 *     about the form, and it is invisible when you are looking at the twelve answers.
 *   - TYPICAL LENGTH. Median characters separates "everyone typed 'n/a'" from "people wrote
 *     paragraphs", which is the difference between a question that worked and one that did
 *     not. Median rather than mean for the usual reason: one essay should not move it.
 *   - THEMES. The words that recur across answers, which is the only thing on this page that
 *     summarises what people actually SAID rather than how they said it.
 */
import type {
  PublishedFormQuestion,
  mjBizAppsFormsFormResponseAnswerEntityType,
} from '@mj-biz-apps/forms-entities';

import { median } from './statistics';

type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/** Terms shown per question. Enough to see a pattern, few enough to read at a glance. */
const MAX_THEMES = 8;

/** A term must appear in at least this many answers before it is a theme rather than a word. */
const MIN_THEME_ANSWERS = 2;

/** Shorter than this and a token is noise regardless of how often it occurs. */
const MIN_TERM_LENGTH = 3;

/**
 * Words carrying no topic, removed before counting.
 *
 * English only, and that is a real limitation rather than an oversight: a French or Spanish
 * form gets its own filler words counted as themes. The alternative — shipping stopword lists
 * for every language, or a language detector — is a large amount of machinery for a panel
 * that is a starting point for reading, not a conclusion. The UI says as much.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now',
  'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use', 'man', 'men', 'too', 'own',
  'say', 'let', 'put', 'end', 'why', 'try', 'ask', 'due', 'far', 'off', 'per', 'via', 'yes',
  'this', 'that', 'with', 'have', 'from', 'they', 'been', 'were', 'said', 'each', 'which',
  'their', 'will', 'about', 'would', 'there', 'could', 'other', 'more', 'very', 'what',
  'know', 'just', 'into', 'than', 'them', 'some', 'when', 'much', 'time', 'also', 'like',
  'want', 'need', 'make', 'made', 'good', 'well', 'able', 'over', 'only', 'then', 'these',
  'those', 'because', 'should', 'being', 'after', 'before', 'while', 'where', 'still',
  'really', 'think', 'thing', 'things', 'lot', 'get', 'got', 'not', 'n/a', 'na', 'none',
  'nil', 'nothing', 'yet', 'may', 'might', 'must', 'shall', 'does', 'doing', 'done',
]);

/** One recurring term and how many answers contained it. */
export interface TextTheme {
  term: string;
  /** Number of ANSWERS containing the term, not total occurrences. */
  answers: number;
  /** answers / answered, 0..1. */
  fraction: number;
}

/** What the Insights view says about one written question. */
export interface OpenTextInsight {
  questionId: string;
  prompt: string;
  /** The builder's name for the type, e.g. "Long text". */
  typeLabel: string;
  answered: number;
  /** Responses that did not answer it. */
  skipped: number;
  /** answered / totalResponses, 0..1. Null when there are no responses to divide by. */
  responseRate: number | null;
  /** Median characters across non-empty answers. Null when nothing was written. */
  medianLength: number | null;
  /** Recurring terms, most common first. Empty when nothing recurs, or when themes do not apply. */
  themes: TextTheme[];
  /**
   * Whether theme extraction is meaningful for this question at all — see `yieldsThemes`.
   * Distinguishes "no pattern found" from "we do not mine this kind of field", which the
   * panel must not conflate: they look identical and mean opposite things.
   */
  themesApply: boolean;
}

/** The words of one answer, lowercased, de-duplicated, filtered. */
export function termsIn(text: string): Set<string> {
  const terms = new Set<string>();
  // Split on anything that is not a letter, digit or intra-word apostrophe/hyphen. Unicode
  // aware, so accented words survive rather than fragmenting into pieces that never recur.
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}'-]+/u)) {
    const term = raw.replace(/^['-]+|['-]+$/g, '');
    if (term.length < MIN_TERM_LENGTH) continue;
    if (STOPWORDS.has(term)) continue;
    // Anything carrying a digit is an identifier, not a word: a bare quantity, a reference
    // code, or a fragment of a timestamp. Live data produced themes reading "1970-01-01t00"
    // and "000z", which are pieces of a serialised date that tokenised into two "words".
    if (/\p{N}/u.test(term)) continue;
    terms.add(term);
  }
  return terms;
}

/**
 * Themes across a set of answers.
 *
 * Counted per ANSWER, not per occurrence: one person writing "pricing" nine times in a rant
 * is one person who mentioned pricing, and counting occurrences would let a single answer
 * invent a theme. `MIN_THEME_ANSWERS` then drops terms that only one person used, which is
 * where almost all of the noise lives.
 */
export function buildThemes(texts: readonly string[]): TextTheme[] {
  if (texts.length === 0) return [];
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const term of termsIn(text)) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_THEME_ANSWERS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_THEMES)
    .map(([term, answers]) => ({ term, answers, fraction: answers / texts.length }));
}

/**
 * Builds the written-answer panel for a form.
 *
 * `typeLabelFor` is injected rather than imported so this module stays free of the builder's
 * presentation catalog — the label is the caller's vocabulary, not this file's business.
 */
/**
 * Whether a question's answers are prose worth mining for themes.
 *
 * LongText only, and this is a deliberate, costly restriction. ShortText is overwhelmingly
 * used for names, reference codes and one-word labels; run word frequency over a "First
 * name" field and the panel lists real people's names with counts beside them — which is
 * precisely the exposure this whole redesign removed, reintroduced through a side door.
 * Observed on live data: "desai — in 13 answers".
 *
 * The cost is real: a ShortText genuinely asking for an opinion ("Which role interests you?")
 * loses a themes list that was informative. That question keeps its response rate, its
 * typical length and a link to the answers, and the trade is worth making in this direction —
 * a missing chart is a gap, a name on a dashboard is a disclosure.
 */
function yieldsThemes(question: PublishedFormQuestion): boolean {
  return question.type === 'LongText';
}

/** Rounds a median that must read as a whole count, preserving "no sample". */
function roundedOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

export function buildOpenTextInsights(
  questions: readonly PublishedFormQuestion[],
  answers: readonly AnswerRow[],
  totalResponses: number,
  typeLabelFor: (question: PublishedFormQuestion) => string,
): OpenTextInsight[] {
  const byQuestion = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.QuestionID);
    if (list) list.push(a);
    else byQuestion.set(a.QuestionID, [a]);
  }

  return questions.map((q) => {
    // De-duplicated by RESPONSE. A question answered across several published versions can
    // otherwise report more answers than the form has responses, and "39 answered · 100%"
    // beside a total of 32 is a sum the reader cannot make work.
    const byResponse = new Map<string, string>();
    for (const a of byQuestion.get(q.id) ?? []) {
      const text = (a.TextValue ?? '').trim();
      if (text.length > 0 && !byResponse.has(a.ResponseID)) {
        byResponse.set(a.ResponseID, text);
      }
    }
    const texts = [...byResponse.values()];
    const answered = texts.length;
    return {
      questionId: q.id,
      prompt: q.prompt,
      typeLabel: typeLabelFor(q),
      answered,
      // Clamped at zero: answers span every published version while questions come from the
      // latest, so a long-lived question can out-count the responses being divided by.
      skipped: Math.max(0, totalResponses - answered),
      responseRate: totalResponses > 0 ? Math.min(1, answered / totalResponses) : null,
      // Rounded here rather than inside `median`: a character count is a whole number, but
      // a duration is not, and the shared helper must not decide that for both.
      medianLength: roundedOrNull(median(texts.map((t) => t.length))),
      themes: yieldsThemes(q) ? buildThemes(texts) : [],
      /** False for short-answer fields, so the panel explains the gap rather than looking broken. */
      themesApply: yieldsThemes(q),
    };
  });
}
