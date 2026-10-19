/**
 * What can be said about written answers (ShortText, LongText) WITHOUT quoting them — moved from
 * forms-ng `open-text-insights.ts`. Verbatims belong to a response's detail, where each has a person
 * and a time attached; on a dashboard three arbitrary answers of forty say nothing about the forty,
 * and when the question is "First name" they are a list of real people.
 *
 * What survives: the RESPONSE RATE (an optional question 12% answer is a finding about the form),
 * the TYPICAL LENGTH (median characters: "n/a" versus paragraphs), and THEMES — recurring terms,
 * LongText only (a ShortText is names and codes as often as opinions; mined, it listed "desai — in
 * 13 answers"). Themes are counted per ANSWER, need at least two, are English-stopword filtered, and
 * drop anything carrying a digit (identifiers and timestamp fragments, not words).
 */
import { foldQuestionId, type FormsOpenTextInsight, type FormsTextTheme, type PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import type { InsightAnswerRow } from './insight-answers.js';
import { insightRoleFor } from './insight-roles.js';
import { median } from './statistics.js';

/** Terms shown per question. */
const MAX_THEMES = 8;

/** A term must appear in at least this many answers to be a theme rather than a word. */
const MIN_THEME_ANSWERS = 2;

/** Shorter than this and a token is noise however often it occurs. */
const MIN_TERM_LENGTH = 3;

/** Words carrying no topic. English only — a real limitation, said so in the UI. */
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
  'really', 'think', 'thing', 'things', 'lot', 'got', 'n/a', 'na', 'none',
  'nil', 'nothing', 'yet', 'might', 'must', 'shall', 'does', 'doing', 'done',
]);

/** The words of one answer, lowercased, de-duplicated and filtered. */
function termsIn(text: string): Set<string> {
  const terms = new Set<string>();
  // Unicode-aware, so accented words survive rather than fragmenting into pieces that never recur.
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}'-]+/u)) {
    const term = raw.replace(/^['-]+|['-]+$/g, '');
    if (term.length < MIN_TERM_LENGTH || STOPWORDS.has(term) || /\p{N}/u.test(term)) {
      continue;
    }
    terms.add(term);
  }
  return terms;
}

/** Recurring terms across `texts`, most common first (ties alphabetical). */
function buildThemes(texts: readonly string[]): FormsTextTheme[] {
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
    .map(([term, answers]) => ({ Term: term, Answers: answers, Fraction: answers / texts.length }));
}

/** One insight per written question in `questions` (others are skipped), in the order given. */
export function buildOpenTextInsights(
  questions: readonly PublishedFormQuestion[],
  answers: readonly InsightAnswerRow[],
  totalResponses: number,
): FormsOpenTextInsight[] {
  const textByQuestion = new Map<string, Map<string, string>>();
  for (const answer of answers) {
    const text = (answer.TextValue ?? '').trim();
    if (text.length === 0) {
      continue;
    }
    const key = foldQuestionId(answer.QuestionID);
    const byResponse = textByQuestion.get(key) ?? new Map<string, string>();
    // De-duplicated by RESPONSE: the first text a response holds for the question is its answer.
    if (!byResponse.has(answer.ResponseID)) {
      byResponse.set(answer.ResponseID, text);
    }
    textByQuestion.set(key, byResponse);
  }
  return questions
    .filter((question) => insightRoleFor(question.type) === 'openText')
    .map((question) => {
      const texts = [...(textByQuestion.get(foldQuestionId(question.id))?.values() ?? [])];
      const answered = texts.length;
      const themesApply = question.type === 'LongText';
      const middle = median(texts.map((t) => t.length));
      return {
        QuestionID: question.id,
        Prompt: question.prompt,
        QuestionType: question.type,
        Answered: answered,
        Skipped: Math.max(0, totalResponses - answered),
        ResponseRate: totalResponses > 0 ? Math.min(1, answered / totalResponses) : null,
        MedianLength: middle === null ? null : Math.round(middle),
        Themes: themesApply ? buildThemes(texts) : [],
        ThemesApply: themesApply,
      };
    });
}
