/**
 * Who responded — the aggregate reading of a form's identity and attachment questions (moved from
 * forms-ng `respondent-profile.ts`).
 *
 * THE RULE THIS MODULE ENFORCES: an email address, phone number, street address or name never leaves
 * it. They are read here, counted and discarded; what comes out is counts, rates and groupings. Three
 * groupings DO carry answer text verbatim, as their labels: email DOMAINS (local parts are dropped
 * before anything is counted), countries, and organisation names as typed — each folded to the top six
 * plus "Other (n more)", and each possibly at a count of 1 (one respondent's personal domain or sole
 * trader's business name). That is what the dashboard showed, to callers who may read every answer in
 * full anyway (see the `FormsGetResponseSummaryOutput` header); it is not anonymisation.
 *
 * Every rate's denominator is the Complete RESPONSE count, not the answer count — "how many of the
 * people who submitted gave an email" — and every numerator is counted by response, so a form that
 * asks for an email twice cannot report "40 of 32".
 */
import {
  foldQuestionId,
  parseJsonObject,
  type FormsAnswerBucket,
  type FormsProfileDistribution,
  type FormsProfileMetric,
  type FormsRespondentProfile,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import type { InsightAnswerRow } from './insight-answers.js';
import { insightRoleFor } from './insight-roles.js';

/** How many groups a profile distribution shows before the tail is folded into "Other". */
const PROFILE_BUCKET_LIMIT = 6;

/**
 * Consumer mailbox providers, to split "reached a person" from "reached an organisation". A hint,
 * labelled as one, and deliberately short: the long tail of regional free providers is unbounded.
 */
const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.ru', 'qq.com',
  '163.com', 'zoho.com', 'fastmail.com',
]);

/** A normalised email address, or `null`. Deliberately loose: a counting heuristic over validated data. */
function emailOf(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(text) ? text : null;
}

function domainOf(email: string): string {
  return email.slice(email.indexOf('@') + 1);
}

/** Non-empty trimmed text, or `null`. */
function textOf(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text.length > 0 ? text : null;
}

/**
 * Counts into buckets, biggest first (ties alphabetical), the tail folded into "Other (n more)" —
 * only when folding saves a row: folding one leftover costs a real label and buys nothing.
 */
function foldedBuckets(counts: Map<string, number>): FormsAnswerBucket[] {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) {
    return [];
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shouldFold = sorted.length > PROFILE_BUCKET_LIMIT + 1;
  const head = shouldFold ? sorted.slice(0, PROFILE_BUCKET_LIMIT) : sorted;
  const tail = shouldFold ? sorted.slice(PROFILE_BUCKET_LIMIT) : [];
  const buckets = head.map(([label, count]) => ({ Label: label, Count: count, Fraction: count / total }));
  if (tail.length > 0) {
    const rest = tail.reduce((sum, [, n]) => sum + n, 0);
    buckets.push({ Label: `Other (${tail.length} more)`, Count: rest, Fraction: rest / total });
  }
  return buckets;
}

/**
 * A count over the responses. Clamped at the total: answers span every version while the total
 * counts Complete responses, and "33 of 32" is a sentence no reader can make sense of.
 */
function ratioMetric(label: string, count: number, total: number, noun: string): FormsProfileMetric {
  const shown = total > 0 ? Math.min(count, total) : count;
  return { Label: label, Value: String(shown), Detail: total > 0 ? `of ${total} ${noun}` : '', Fraction: total > 0 ? shown / total : null };
}

/** What the answers to the profiled questions add up to, before formatting. */
interface ProfileTally {
  emails: Set<string>;
  contactable: Set<string>;
  domains: Map<string, number>;
  countries: Map<string, number>;
  companies: Map<string, number>;
  phone: Set<string>;
  website: Set<string>;
  address: Set<string>;
  file: Set<string>;
  doodle: Set<string>;
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function noteEmail(tally: ProfileTally, responseId: string, raw: unknown): void {
  const email = emailOf(typeof raw === 'string' ? raw : null);
  if (!email) {
    return;
  }
  tally.contactable.add(responseId);
  tally.emails.add(email);
  bump(tally.domains, domainOf(email));
}

/** Fold one answer of a profiled question into the tally. */
function tallyAnswer(tally: ProfileTally, question: PublishedFormQuestion, answer: InsightAnswerRow): void {
  switch (question.type) {
    case 'Email':
      noteEmail(tally, answer.ResponseID, answer.TextValue);
      break;
    case 'Phone':
      if (textOf(answer.TextValue)) tally.phone.add(answer.ResponseID);
      break;
    case 'Website':
      if (textOf(answer.TextValue)) tally.website.add(answer.ResponseID);
      break;
    case 'Address': {
      const address = parseJsonObject(answer.JSONValue);
      if (!address) break;
      // Any part filled in is an address given; requiring every part under-reports city-and-country forms.
      if (Object.values(address).some((part) => textOf(part))) tally.address.add(answer.ResponseID);
      const country = textOf(address.country);
      if (country) bump(tally.countries, country);
      break;
    }
    case 'ContactInfo': {
      const contact = parseJsonObject(answer.JSONValue);
      if (!contact) break;
      noteEmail(tally, answer.ResponseID, contact.email);
      if (textOf(contact.phone)) tally.phone.add(answer.ResponseID);
      const company = textOf(contact.company);
      if (company) bump(tally.companies, company);
      break;
    }
    case 'FileUpload':
      if (answer.FileID) tally.file.add(answer.ResponseID);
      break;
    case 'Doodle':
      if (answer.FileID) tally.doodle.add(answer.ResponseID);
      break;
    default:
      // Every identity and attachment type is handled above; a new one contributes nothing rather
      // than being miscounted as something it is not.
      break;
  }
}

function isProfiled(question: PublishedFormQuestion): boolean {
  const role = insightRoleFor(question.type);
  return role === 'identity' || role === 'attachment';
}

/** The "Who responded" section, from the Complete responses' answers to the form's profiled questions. */
export function buildRespondentProfile(
  questions: readonly PublishedFormQuestion[],
  answers: readonly InsightAnswerRow[],
  totalResponses: number,
): FormsRespondentProfile {
  const profiled = questions.filter(isProfiled);
  const byId = new Map(profiled.map((question) => [foldQuestionId(question.id), question]));
  const tally: ProfileTally = {
    emails: new Set(), contactable: new Set(), domains: new Map(), countries: new Map(), companies: new Map(),
    phone: new Set(), website: new Set(), address: new Set(), file: new Set(), doodle: new Set(),
  };
  for (const answer of answers) {
    const question = byId.get(foldQuestionId(answer.QuestionID));
    if (question) {
      tallyAnswer(tally, question, answer);
    }
  }
  return {
    // About the FORM, not the data: a form that asks for an email and has no responses yet still
    // shows the section, reading zero.
    IsEmpty: profiled.length === 0,
    Metrics: profileMetrics(tally, totalResponses),
    Distributions: profileDistributions(tally),
  };
}

function profileMetrics(tally: ProfileTally, total: number): FormsProfileMetric[] {
  const metrics: FormsProfileMetric[] = [];
  if (tally.contactable.size > 0 || tally.domains.size > 0) {
    metrics.push(ratioMetric('Contactable', tally.contactable.size, total, 'responses gave an email'));
    const repeats = Math.max(0, tally.contactable.size - tally.emails.size);
    metrics.push({
      Label: 'Distinct people',
      Value: String(tally.emails.size),
      Detail: repeats > 0 ? `${repeats} submitted more than once` : 'no repeat submissions',
      Fraction: null,
    });
    // Over distinct ADDRESSES: one person submitting three times from work is not three work addresses.
    const corporate = [...tally.emails].filter((e) => !CONSUMER_EMAIL_DOMAINS.has(domainOf(e))).length;
    const distinct = tally.emails.size;
    metrics.push({
      Label: 'Work addresses',
      Value: distinct > 0 ? `${Math.round((corporate / distinct) * 100)}%` : '—',
      Detail: 'not a known consumer mailbox',
      Fraction: distinct > 0 ? corporate / distinct : null,
    });
  }
  const coverage: [string, Set<string>][] = [
    ['Phone given', tally.phone],
    ['Website given', tally.website],
    ['Address given', tally.address],
    ['Drawing given', tally.doodle],
    ['Files attached', tally.file],
  ];
  for (const [label, responses] of coverage) {
    if (responses.size > 0) {
      metrics.push(ratioMetric(label, responses.size, total, 'responses'));
    }
  }
  return metrics;
}

function profileDistributions(tally: ProfileTally): FormsProfileDistribution[] {
  const distributions: FormsProfileDistribution[] = [];
  if (tally.domains.size > 0) {
    distributions.push({
      Title: 'Email domains',
      Caption: 'Where respondents’ addresses are hosted. Local parts are never read or stored here.',
      Buckets: foldedBuckets(tally.domains),
    });
  }
  if (tally.countries.size > 0) {
    distributions.push({ Title: 'Countries', Caption: 'From the country part of the address question.', Buckets: foldedBuckets(tally.countries) });
  }
  if (tally.companies.size > 0) {
    distributions.push({ Title: 'Organisations', Caption: 'As typed by respondents, so spellings are not merged.', Buckets: foldedBuckets(tally.companies) });
  }
  return distributions;
}
