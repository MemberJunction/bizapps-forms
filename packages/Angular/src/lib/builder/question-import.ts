/**
 * Turn pasted text into draft questions.
 *
 * The point is the boring case: someone has the questions already — in a doc, a spreadsheet
 * column, an email from the person who actually owns the form — and adding twenty of them one
 * click at a time is the reason the form does not get built. Pasting is the fast path.
 *
 * Pure and framework-free so the parsing rules are testable without a builder, a form or a
 * database. The caller creates the entities.
 *
 * SYNTAX, in ascending order of how much the author cares:
 *
 * ```
 * What is your name?                     → ShortText, optional
 * Email address *                        → Email (inferred), required
 * # Tell us about yourself               → a page break; the rest goes on a new page
 * Favourite colour [choice] red | green  → SingleChoice with two options
 * How likely to recommend? [nps]         → an explicit type
 * ```
 *
 * TYPE INFERENCE runs only when no `[type]` tag is given, and only on unmistakable wording. It
 * is deliberately timid: guessing `Date` from a line containing "when" would be clever and
 * wrong more often than it is right, and a mis-typed question is more annoying to fix than an
 * untyped one — the author has to notice it first.
 */
import { FORM_QUESTION_TYPES, type FormQuestionType } from '@mj-biz-apps/forms-entities';

/** One question parsed out of pasted text. */
export interface ImportedQuestion {
  prompt: string;
  type: FormQuestionType;
  isRequired: boolean;
  /** Option labels for choice-style types; empty otherwise. */
  options: string[];
}

/** A page of imported questions. A paste with no `#` heading yields exactly one. */
export interface ImportedPage {
  /** Page title, or `undefined` for the leading page of a paste with no headings. */
  title?: string;
  questions: ImportedQuestion[];
}

/**
 * Guard against a paste that is a whole document rather than a list of questions.
 *
 * Without a cap, dropping a 400-page PDF's text in creates thousands of rows one round trip at
 * a time — a builder that appears to hang, and a form that then has to be deleted question by
 * question. The cap is generous enough that no genuine questionnaire hits it.
 */
export const MAX_IMPORTED_QUESTIONS = 200;

/** Result of a parse: the pages, plus what was dropped and why. */
export interface ImportResult {
  pages: ImportedPage[];
  /** Total questions across all pages. */
  count: number;
  /** Set when {@link MAX_IMPORTED_QUESTIONS} was hit and later lines were discarded. */
  truncatedAt?: number;
}

/** Wording that identifies a type well enough to be worth guessing. */
const INFERENCE: ReadonlyArray<{ re: RegExp; type: FormQuestionType }> = [
  { re: /\be-?mail\b/i, type: 'Email' },
  { re: /\bphone\b|\bmobile\b|\btelephone\b/i, type: 'Phone' },
  { re: /\bwebsite\b|\bweb ?site\b|\burl\b/i, type: 'Website' },
  { re: /\baddress\b/i, type: 'Address' },
  { re: /\bhow many\b|\bnumber of\b|\bage\b/i, type: 'Number' },
  { re: /\bhow likely\b.*\brecommend\b/i, type: 'NPS' },
];

/**
 * Parse pasted text into pages of questions.
 *
 * Blank lines are separators and carry no meaning — pasted text is full of them and treating
 * one as a page break would fragment every real-world paste.
 */
export function parseImportedQuestions(text: string): ImportResult {
  const pages: ImportedPage[] = [{ questions: [] }];
  let count = 0;
  let truncatedAt: number | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      continue;
    }
    if (line.startsWith('#')) {
      pages.push({ title: line.replace(/^#+\s*/, '') || undefined, questions: [] });
      continue;
    }
    if (count >= MAX_IMPORTED_QUESTIONS) {
      truncatedAt = MAX_IMPORTED_QUESTIONS;
      break;
    }
    const question = parseLine(line);
    if (question) {
      pages[pages.length - 1].questions.push(question);
      count++;
    }
  }

  return {
    // A heading with nothing under it would otherwise publish as an empty page — a section
    // break the respondent sees as a blank screen with a Next button.
    pages: pages.filter((p) => p.questions.length > 0),
    count,
    ...(truncatedAt === undefined ? {} : { truncatedAt }),
  };
}

/** Parse one non-blank, non-heading line. Returns `undefined` when nothing is left of it. */
function parseLine(line: string): ImportedQuestion | undefined {
  // The required marker is stripped TWICE, and both are needed: once from the whole line, which
  // catches `Prompt [type] *` (where the trailing `*` would otherwise sit in the options slot and
  // become a one-option choice list called "*"), and again from the prompt after the tag is cut
  // out, which catches `Prompt * [type]`. Authors write both orders and neither is wrong.
  const trailingRequired = /\*\s*$/;
  let isRequired = trailingRequired.test(line);
  let rest = line.replace(trailingRequired, '').trim();
  let options: string[] = [];

  // Options come after the type tag: "Colour [choice] red | green | blue".
  const tagMatch = /\[([a-z]+)\]/i.exec(rest);
  let taggedType: FormQuestionType | undefined;
  if (tagMatch) {
    taggedType = resolveTypeTag(tagMatch[1]);
    const afterTag = rest.slice(tagMatch.index + tagMatch[0].length).trim();
    if (afterTag) {
      options = afterTag.split('|').map((o) => o.trim()).filter((o) => o !== '');
    }
    rest = rest.slice(0, tagMatch.index).trim();
  }

  if (trailingRequired.test(rest)) {
    isRequired = true;
    rest = rest.replace(trailingRequired, '').trim();
  }

  const prompt = rest;
  if (prompt === '') {
    return undefined;
  }

  const type = taggedType ?? inferType(prompt, options);
  return { prompt, type, isRequired, options };
}

/**
 * Aliases for the type names nobody guesses right.
 *
 * `choice` above all: "multiple choice" means pick-ONE to most people, while `MultiChoice` here
 * means pick-many. An author tagging `[multiple choice]` and getting a pick-many control would
 * be reasonably annoyed, so the short, unambiguous `[choice]` is the one documented.
 */
const TYPE_ALIASES: Readonly<Record<string, FormQuestionType>> = {
  choice: 'SingleChoice',
  single: 'SingleChoice',
  multi: 'MultiChoice',
  checkboxes: 'MultiChoice',
  text: 'ShortText',
  short: 'ShortText',
  long: 'LongText',
  paragraph: 'LongText',
  tel: 'Phone',
  url: 'Website',
  scale: 'OpinionScale',
  stars: 'Rating',
  file: 'FileUpload',
  yesno: 'YesNo',
  contact: 'ContactInfo',
};

/**
 * Canonical type names keyed by their lowercase spelling.
 *
 * Built from `FORM_QUESTION_TYPES` rather than listed here, so a type added to the contract is
 * tag-addressable the moment it exists — the same derive-don't-copy rule the rest of this change
 * follows.
 */
const CANONICAL_BY_LOWER: ReadonlyMap<string, FormQuestionType> = new Map(
  FORM_QUESTION_TYPES.map((t) => [t.toLowerCase(), t] as const),
);

/** Resolve a `[tag]` to a question type: an alias first, then a canonical name. */
function resolveTypeTag(tag: string): FormQuestionType | undefined {
  const lower = tag.toLowerCase();
  return TYPE_ALIASES[lower] ?? CANONICAL_BY_LOWER.get(lower);
}

/** Guess a type from the prompt, defaulting to short text. */
function inferType(prompt: string, options: string[]): FormQuestionType {
  // Options given without a type tag can only mean a choice question.
  if (options.length > 0) {
    return 'SingleChoice';
  }
  for (const rule of INFERENCE) {
    if (rule.re.test(prompt)) {
      return rule.type;
    }
  }
  return 'ShortText';
}
