/**
 * Who reached us — the aggregate reading of a form's identity and attachment questions.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: an identity answer's VALUE never leaves this file.
 * Emails, phone numbers, street addresses and names are read here, counted, and discarded;
 * what comes out is counts, rates and coarse groupings. Nothing in the returned model can
 * identify a respondent. That is not only a privacy position — it is the better analysis. A
 * column of 40 email addresses tells a form owner nothing they cannot get from the Responses
 * table; "31 of 40 gave an email, 28 of them distinct, 61% on corporate domains" answers the
 * question they actually had.
 *
 * The one grouping that comes close to the line is the email DOMAIN, and it stays on the safe
 * side of it: `gmail.com` describes a population, not a person, and the split between free
 * and corporate domains is one of the few genuinely decision-changing facts an intake form
 * collects. Local parts are dropped before anything is counted.
 */
import type {
  AddressAnswer,
  ContactInfoAnswer,
  PublishedFormQuestion,
  mjBizAppsFormsFormResponseAnswerEntityType,
} from '@mj-biz-apps/forms-entities';
import { insightRoleFor } from './question-insight-roles';
import type { DistributionBucket } from '../models/reporting.model';

type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/** How many groups a profile distribution shows before the tail is folded into "Other". */
const PROFILE_BUCKET_LIMIT = 6;

/**
 * Consumer mailbox providers, used to split "reached a person" from "reached an organisation".
 *
 * Deliberately short and deliberately incomplete. It is a HINT, labelled as one in the UI, not
 * a classification anyone should act on alone — the long tail of regional free providers is
 * unbounded and chasing it would turn a useful signal into a maintenance burden that is still
 * wrong. Covering the providers that dominate real intake data gets the ratio close enough to
 * be worth reading.
 */
const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.ru', 'qq.com',
  '163.com', 'zoho.com', 'fastmail.com',
]);

/** One counted fact about the respondent population. */
export interface ProfileMetric {
  /** What is being counted, e.g. "Contactable". */
  label: string;
  /** The figure itself, already formatted for display. */
  value: string;
  /** The reading under it, e.g. "31 of 40 gave an email address". Empty when the value says it all. */
  detail: string;
  /** 0..1 when the metric is a share of the responses, for the inline meter. Null otherwise. */
  fraction: number | null;
}

/** A named grouping of the population — email domains, countries, companies. */
export interface ProfileDistribution {
  title: string;
  /** What the grouping means, and any caveat it carries. */
  caption: string;
  buckets: DistributionBucket[];
}

/** The "Who responded" section's complete read-model. */
export interface RespondentProfile {
  /** True when the form asks nothing that profiles a respondent; the section is then omitted. */
  isEmpty: boolean;
  metrics: ProfileMetric[];
  distributions: ProfileDistribution[];
}

/** A normalised email address, or null when the text is not one. */
function emailOf(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim().toLowerCase();
  // Deliberately loose. This is a counting heuristic over data a validator already accepted,
  // not a second validator; the cost of rejecting a real address is a wrong count.
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(text) ? text : null;
}

/** The domain half of a normalised address. */
function domainOf(email: string): string {
  return email.slice(email.indexOf('@') + 1);
}

/** Parsed JSON answer, or null when the column is absent or unparseable. */
function jsonOf<T>(answer: AnswerRow): T | null {
  const raw = answer.JSONValue;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    // A malformed composite answer is one row that cannot be counted, not a failed report.
    // Swallowing it here is safe precisely because the caller's denominator is the RESPONSE
    // count, which is unaffected — the row shows up as "did not give an email", not as a
    // smaller population.
    return null;
  }
}

/** Non-empty trimmed text, or null. */
function textOf(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  return text.length > 0 ? text : null;
}

/**
 * Counts into buckets, biggest first, folding the tail into "Other".
 *
 * The fold is what keeps these honest at both ends: a distribution of 300 companies is not a
 * chart, and silently showing the top six would imply the population is six.
 */
function foldedBuckets(counts: Map<string, number>, limit = PROFILE_BUCKET_LIMIT): DistributionBucket[] {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  const buckets: DistributionBucket[] = head.map(([label, count]) => ({
    label,
    count,
    fraction: count / total,
  }));
  if (tail.length > 0) {
    const rest = tail.reduce((sum, [, n]) => sum + n, 0);
    buckets.push({ label: `Other (${tail.length} more)`, count: rest, fraction: rest / total });
  }
  return buckets;
}

function ratioMetric(
  label: string,
  count: number,
  total: number,
  noun: string,
): ProfileMetric {
  // Clamped, not just the bar. Answers span every published version while `total` counts
  // complete responses of the current one, so a long-lived question can still out-count its
  // denominator even after the per-response de-duplication above. "33 of 32" is a statement
  // no reader can make sense of; capping it costs a hair of precision in a rare case and
  // keeps every sentence on the panel true.
  const shown = total > 0 ? Math.min(count, total) : count;
  const fraction = total > 0 ? shown / total : null;
  return {
    label,
    value: String(shown),
    detail: total > 0 ? `of ${total} ${noun}` : '',
    fraction,
  };
}

/**
 * Builds the respondent profile from a form's identity and attachment answers.
 *
 * `totalResponses` is the denominator for every rate, and it is the RESPONSE count rather
 * than the answer count on purpose: "how many of the people who submitted gave us an email"
 * is the question, so a skipped question has to count against the rate. Passing an answer
 * count instead would report 100% coverage for a question almost nobody filled in.
 */
export function buildRespondentProfile(
  questions: readonly PublishedFormQuestion[],
  answers: readonly AnswerRow[],
  totalResponses: number,
): RespondentProfile {
  const byQuestion = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.QuestionID);
    if (list) list.push(a);
    else byQuestion.set(a.QuestionID, [a]);
  }

  const emails = new Set<string>();
  /**
   * Responses that supplied a usable email — counted by RESPONSE, not by answer row.
   *
   * A form can ask for an email twice (a plain Email question and a ContactInfo block), and
   * a response answering both would otherwise count as two contactable people. Against a
   * denominator of responses that produced "40 of 32", which is not a rounding error but an
   * impossible sentence.
   */
  const contactableResponses = new Set<string>();
  const domainCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const companyCounts = new Map<string, number>();
  // All counted by response for the same reason as the email set above.
  const phoneResponses = new Set<string>();
  const websiteResponses = new Set<string>();
  const addressResponses = new Set<string>();
  const fileResponses = new Set<string>();
  const signatureResponses = new Set<string>();
  let hasIdentityQuestion = false;
  let hasAttachmentQuestion = false;

  const noteEmail = (responseId: string, raw: string | null | undefined): void => {
    const email = emailOf(raw);
    if (!email) return;
    contactableResponses.add(responseId);
    emails.add(email);
    const domain = domainOf(email);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  };

  for (const q of questions) {
    const role = insightRoleFor(q.type);
    if (role !== 'identity' && role !== 'attachment') continue;
    if (role === 'identity') hasIdentityQuestion = true;
    else hasAttachmentQuestion = true;

    for (const a of byQuestion.get(q.id) ?? []) {
      switch (q.type) {
        case 'Email':
          noteEmail(a.ResponseID, a.TextValue);
          break;
        case 'Phone':
          if (textOf(a.TextValue)) phoneResponses.add(a.ResponseID);
          break;
        case 'Website':
          if (textOf(a.TextValue)) websiteResponses.add(a.ResponseID);
          break;
        case 'Address': {
          const address = jsonOf<AddressAnswer>(a);
          if (!address) break;
          // Any part filled in counts as an address given; requiring every part would
          // under-report every form that asks for a city and a country.
          if (Object.values(address).some((v) => textOf(v))) addressResponses.add(a.ResponseID);
          const country = textOf(address.country);
          if (country) {
            const key = country.trim();
            countryCounts.set(key, (countryCounts.get(key) ?? 0) + 1);
          }
          break;
        }
        case 'ContactInfo': {
          const contact = jsonOf<ContactInfoAnswer>(a);
          if (!contact) break;
          noteEmail(a.ResponseID, contact.email);
          if (textOf(contact.phone)) phoneResponses.add(a.ResponseID);
          const company = textOf(contact.company);
          if (company) companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1);
          break;
        }
        case 'FileUpload':
          if (a.FileID) fileResponses.add(a.ResponseID);
          break;
        case 'Signature':
          if (a.FileID) signatureResponses.add(a.ResponseID);
          break;
        default:
          // Every identity/attachment type is handled above. A new one reaching here
          // contributes nothing rather than being miscounted as something it is not.
          break;
      }
    }
  }

  const metrics: ProfileMetric[] = [];

  const contactable = contactableResponses.size;
  if (contactable > 0 || domainCounts.size > 0) {
    metrics.push(ratioMetric('Contactable', contactable, totalResponses, 'responses gave an email'));
    const repeats = Math.max(0, contactable - emails.size);
    metrics.push({
      label: 'Distinct people',
      value: String(emails.size),
      // The repeat count is the reason this metric is here rather than being assumed equal to
      // the response count — a form linked from a newsletter collects the same person twice,
      // and every per-person rate on this page is wrong if nobody says so.
      detail: repeats > 0 ? `${repeats} submitted more than once` : 'no repeat submissions',
      fraction: null,
    });
    // Measured over distinct ADDRESSES, not over responses: the question is what kind of
    // mailbox this population uses, and one person submitting three times from the same work
    // address should not make the form look three times more corporate than it is.
    const distinctDomainTotal = emails.size;
    const corporate = [...emails].filter((e) => !CONSUMER_EMAIL_DOMAINS.has(domainOf(e))).length;
    metrics.push({
      label: 'Work addresses',
      value: distinctDomainTotal > 0 ? `${Math.round((corporate / distinctDomainTotal) * 100)}%` : '—',
      detail: 'not a known consumer mailbox',
      fraction: distinctDomainTotal > 0 ? corporate / distinctDomainTotal : null,
    });
  }

  if (phoneResponses.size > 0) metrics.push(ratioMetric('Phone given', phoneResponses.size, totalResponses, 'responses'));
  if (websiteResponses.size > 0) metrics.push(ratioMetric('Website given', websiteResponses.size, totalResponses, 'responses'));
  if (addressResponses.size > 0) metrics.push(ratioMetric('Address given', addressResponses.size, totalResponses, 'responses'));
  if (signatureResponses.size > 0) metrics.push(ratioMetric('Signed', signatureResponses.size, totalResponses, 'responses'));
  if (fileResponses.size > 0) metrics.push(ratioMetric('Files attached', fileResponses.size, totalResponses, 'responses'));

  const distributions: ProfileDistribution[] = [];
  if (domainCounts.size > 0) {
    distributions.push({
      title: 'Email domains',
      caption: 'Where respondents’ addresses are hosted. Local parts are never read or stored here.',
      buckets: foldedBuckets(domainCounts),
    });
  }
  if (countryCounts.size > 0) {
    distributions.push({
      title: 'Countries',
      caption: 'From the country part of the address question.',
      buckets: foldedBuckets(countryCounts),
    });
  }
  if (companyCounts.size > 0) {
    distributions.push({
      title: 'Organisations',
      caption: 'As typed by respondents, so spellings are not merged.',
      buckets: foldedBuckets(companyCounts),
    });
  }

  return {
    // Emptiness is about the FORM, not the data: a form with an email question and no
    // responses yet should still show the section, reading zero, rather than implying it
    // never asked. A form that asks nothing identifying has no section at all.
    isEmpty: !hasIdentityQuestion && !hasAttachmentQuestion,
    metrics,
    distributions,
  };
}
