/**
 * Resolve WHICH form a smoke run targets, and the questions inside it, from the database.
 *
 * These scripts used to name their fixture in three hardcoded places at once: a default slug of
 * `contact-us-e2e`, and — in the binding seed — the literal GUIDs of that form's Email and name
 * questions. Any database without that exact form could not run the suite, and the failures said
 * so in the least useful way available. A missing form left the form id as an empty string, which
 * surfaced several statements later as `Conversion failed when converting from a character string
 * to uniqueidentifier`; a present form with different questions produced a binding that ran and
 * failed on `Submission is missing required value(s): Email`, which reads exactly like a product
 * defect. Both were the fixture describing a form nobody had.
 *
 * So nothing here names a form. A slug comes from the command line or the environment, and when
 * neither is given one is DISCOVERED and printed — never silently assumed. Question ids are
 * resolved BY ROLE (the email question, the given-name question) from whatever form was chosen,
 * which is what makes the same suite run against a contact form, a job application, or whatever a
 * given database happens to carry.
 *
 * Everything here fails loudly and specifically. A smoke script that cannot find its fixture must
 * say which form it looked at and what it wanted from it, because the alternative — as the two
 * failures above show — is a message that sends people to the wrong bug.
 */
import { requireDbEnv, sql } from './sqlcmd.mjs';

/** A form's question, as the smoke fixtures need to see it. */
/**
 * @typedef {{ id: string, type: string, pageId: string, displayOrder: number, prompt: string }} SmokeQuestion
 */

/** Every slug that currently resolves to a form, for error messages that can be acted on. */
export function availableSlugs() {
  const out = sql(
    `SELECT d.Slug FROM __mj_BizAppsForms.FormDistribution d
     JOIN __mj_BizAppsForms.Form f ON f.ID = d.FormID
     WHERE d.Slug IS NOT NULL AND LEN(d.Slug) > 0 ORDER BY d.Slug;`,
  );
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * The slug this run targets: `argv[2]`, else `FORMS_SMOKE_SLUG`, else discovered.
 *
 * Discovery deliberately requires a PUBLISHED version and an Email question, because those are
 * what every suite here needs — a form missing either would be chosen and then fail deep inside a
 * test for reasons that have nothing to do with the code under test. Ordering is alphabetical so
 * two runs on the same database pick the same form.
 */
export function resolveSlug(scriptName) {
  const given = process.argv[2] || process.env.FORMS_SMOKE_SLUG;
  if (given) {
    return given;
  }
  // Only DISCOVERY needs the database. A script handed a slug stays reachable over HTTP alone,
  // which is how `respondent-path` and `respondent-scope-path` are meant to be runnable against a
  // deployed API with no docker or sqlcmd anywhere near it.
  requireDbEnv(scriptName);
  const discovered = sql(
    `SELECT TOP 1 d.Slug FROM __mj_BizAppsForms.FormDistribution d
     JOIN __mj_BizAppsForms.Form f ON f.ID = d.FormID
     WHERE d.Slug IS NOT NULL AND LEN(d.Slug) > 0
       AND EXISTS (SELECT 1 FROM __mj_BizAppsForms.FormVersion v WHERE v.FormID = f.ID AND v.Status = 'Published')
       AND EXISTS (SELECT 1 FROM __mj_BizAppsForms.FormQuestion q WHERE q.FormID = f.ID AND q.QuestionType = 'Email')
     ORDER BY d.Slug;`,
  ).trim();
  if (!discovered) {
    const slugs = availableSlugs();
    throw new Error(
      `No published form with an Email question exists in this database, so ${scriptName} has ` +
        'nothing to run against. Publish one in the builder, then pass its slug as the first ' +
        `argument or set FORMS_SMOKE_SLUG. ${
          slugs.length ? `Distributions that do exist: ${slugs.join(', ')}.` : 'No distributions exist at all.'
        }`,
    );
  }
  console.log(`  note  no slug given; discovered "${discovered}" (pass one as argv[2] or set FORMS_SMOKE_SLUG to pin it)`);
  return discovered;
}

/**
 * Why this slug cannot be used for a suite that mutates a seeded fixture, or undefined when it can.
 *
 * Pure, so the decision is testable without a database — see `fixture.spec.mjs`. Case- and
 * space-folded because one side comes off a command line and the other out of SQL Server.
 */
export function describeSeedWiringMismatch({ slug, wiredSlugs = [], scriptName = 'this suite' }) {
  const fold = (v) => String(v ?? '').trim().toLowerCase();
  if (wiredSlugs.some((candidate) => fold(candidate) === fold(slug))) {
    return undefined;
  }
  if (wiredSlugs.length === 0) {
    return (
      `${scriptName} mutates a seeded automation and asserts on what it did, and no published ` +
      'form is wired to it. Run `npm run smoke:binding:seed` first — it creates the binding AND ' +
      'the automation that points at it.'
    );
  }
  return (
    `${scriptName} is wired to a seeded automation that "${slug}" does not run, so every ` +
    'assertion it makes about that automation would be about a different form\'s. Pass ' +
    `"${wiredSlugs[0]}" instead.`
  );
}

/**
 * The slug of the form a SEEDED fixture is actually wired to, found by the row it owns.
 *
 * {@link resolveSlug} answers "some published form with an Email question", which is right for a
 * suite that only needs somewhere to submit. It is WRONG for a suite that mutates a seeded
 * automation or binding and then asserts on what that row did, because the form it picks
 * alphabetically need not be the form whose automation points at the row. That is not
 * hypothetical: `resume-arc-path` patched the smoke binding's FieldMappings, ran against a
 * different form whose automation pointed somewhere else, and reported the missing value as a
 * product defect; `automation-semantics-path` rewrote one form's authored automations and then
 * asserted counts against another's.
 *
 * THE CHECK LIVES HERE, NOT IN THE CALLERS. An earlier version documented it as the caller's
 * obligation for an explicitly-passed slug — and one caller of three honoured it, so
 * `npm run smoke:binding -- some-other-slug` walked straight back into the bug this function was
 * written to close. An obligation that three files have to remember is one that two of them will
 * forget; verifying it here is the same fix one level deeper.
 *
 * Deliberately does NOT filter on `IsActive`: `automation-semantics-path` disables the automation
 * mid-run, and a suite that cannot find its own fixture because a previous run left it disabled
 * fails for a reason that has nothing to do with what it tests.
 */
export function resolveSeededSlug(scriptName, { automationId, bindingId } = {}) {
  requireDbEnv(scriptName);
  const predicate = automationId
    ? `a.ID = '${escape(automationId)}'`
    : `a.BindingID = '${escape(bindingId)}'`;
  const out = sql(
    `SELECT d.Slug FROM __mj_BizAppsForms.FormAutomation a
     JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID = a.FormID
     WHERE ${predicate} AND d.Slug IS NOT NULL AND LEN(d.Slug) > 0
     ORDER BY d.Slug;`,
  );
  const wiredSlugs = out ? out.split('\n').map((v) => v.trim()).filter(Boolean) : [];

  const given = process.argv[2] || process.env.FORMS_SMOKE_SLUG;
  const slug = given || wiredSlugs[0];
  const mismatch = describeSeedWiringMismatch({ slug, wiredSlugs, scriptName });
  if (mismatch) {
    throw new Error(mismatch);
  }
  if (!given) {
    console.log(`  note  no slug given; using "${slug}" — the form its seeded fixture is wired to`);
  }
  return slug;
}

/** The form id behind a slug. Throws naming the slugs that would have worked. */
export function resolveFormId(slug) {
  const formId = sql(
    `SELECT TOP 1 CAST(f.ID AS varchar(40)) FROM __mj_BizAppsForms.Form f
     JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID = f.ID WHERE d.Slug = '${escape(slug)}';`,
  ).trim();
  if (!formId) {
    const slugs = availableSlugs();
    throw new Error(
      `No form is published at slug "${slug}". ${
        slugs.length ? `Available: ${slugs.join(', ')}.` : 'This database has no form distributions at all.'
      }`,
    );
  }
  return formId;
}

/**
 * Every question on a form, in display order.
 *
 * The free-text prompt is selected LAST and the remainder of the split is rejoined into it, so a
 * prompt containing the column separator cannot shift the other fields.
 */
export function resolveQuestions(formId) {
  const out = sql(
    `SELECT CAST(q.ID AS varchar(40)), q.QuestionType, CAST(q.PageID AS varchar(40)), q.DisplayOrder, ISNULL(q.Prompt, '')
     FROM __mj_BizAppsForms.FormQuestion q WHERE q.FormID = '${escape(formId)}' ORDER BY q.DisplayOrder;`,
  );
  if (!out) {
    return [];
  }
  return out.split('\n').filter((l) => l.trim()).map((line) => {
    const [id, type, pageId, displayOrder, ...rest] = line.split('|');
    return {
      id: id.trim(),
      type: type.trim(),
      pageId: pageId.trim(),
      displayOrder: Number(displayOrder.trim()),
      prompt: rest.join('|').trim(),
    };
  });
}

/**
 * The question a respondent puts their email address in.
 *
 * Typed `Email` first, because that is unambiguous. The prompt fallback exists because a form
 * author can collect an email in a ShortText and plenty do — `isEmailAnswer` in the upsert action
 * makes the same allowance, and a fixture that is stricter than the code under test would skip
 * forms the product handles.
 */
export function pickEmailQuestion(questions) {
  return questions.find((q) => q.type === 'Email') ?? questions.find((q) => /e-?mail/i.test(q.prompt));
}

/**
 * The question holding a person's given name.
 *
 * Prefers an explicit "first"/"given" prompt over a bare "name", so a form carrying both `Full
 * name` and `First name` binds the one that maps to `Person.FirstName` rather than whichever came
 * first in display order.
 */
export function pickNameQuestion(questions) {
  const named = questions.filter((q) => /name/i.test(q.prompt) && q.type === 'ShortText');
  return named.find((q) => /first|given/i.test(q.prompt)) ?? named[0];
}

/** Fail with the form, the questions it does have, and what was wanted — not with `undefined`. */
export function requireQuestion(question, wanted, slug, questions) {
  if (question) {
    return question;
  }
  const inventory = questions.length
    ? questions.map((q) => `${q.type} "${q.prompt}"`).join(', ')
    : 'it has no questions at all';
  throw new Error(
    `The form at "${slug}" has no question that can serve as ${wanted}. It carries: ${inventory}. ` +
      'Pass a different slug as the first argument, or add the question to this form.',
  );
}

/**
 * One type-correct answer for a question from the PUBLISHED DEFINITION, or `null` when a smoke run
 * cannot supply one.
 *
 * Operates on the definition's shape rather than the database row because only the definition
 * carries `options`, and choices are where the previous copies of this went wrong: both sent a
 * literal `'smoke'`, which the server rejects with `Choose one of the offered options` on any form
 * whose choices are real. Picking the question's own first option is what lets these suites run
 * against a form somebody actually built.
 *
 * The two hops matter. `toAnswerInput` (core/answer-value.ts) picks the typed COLUMN, then
 * `submission-mapping.ts` serialises it — so `jsonValue` is a JSON STRING in the SDL, and passing
 * an array straight through is rejected before any resolver runs.
 *
 * `Doodle` and `FileUpload` return null: both need a real artifact, and a file id has to come
 * from an actual upload so its provenance can be attributed. Callers supply those through
 * `overrides`.
 */
export function answerFor(question, { email, name } = {}) {
  const firstOption = (question.options ?? [])[0];
  const optionValue = firstOption?.value ?? firstOption?.label;
  switch (question.type) {
    case 'Number':
    case 'Rating':
    case 'NPS':
      return { numericValue: 7 };
    case 'YesNo':
      return { booleanValue: true };
    case 'Date':
      return { dateValue: new Date(0).toISOString() };
    // A Time answer is a bare clock reading, NOT an instant — the wire format `<input type="time">`
    // emits and the only one the server accepts (#116, `contracts/answer-date.ts`). This shared the
    // `Date` case until the format was pinned, sending an ISO instant that every Time question now
    // refuses with "Enter a valid time.", which would have failed every smoke that submits a
    // response against a form carrying one.
    case 'Time':
      return { dateValue: '09:30' };
    case 'MultiChoice':
      return optionValue ? { jsonValue: JSON.stringify([optionValue]) } : null;
    case 'SingleChoice':
    case 'Dropdown':
    case 'PictureChoice':
      return optionValue ? { textValue: optionValue } : null;
    case 'Email':
      return { textValue: email ?? 'smoke@example.com' };
    case 'Phone':
      return { textValue: '+1 555 010 1234' };
    case 'Website':
      return { textValue: 'https://example.com/smoke' };
    case 'OpinionScale':
      // Default bounds are 1..10 (`opinionScaleBounds`); 1 is inside every scale an author can set,
      // since the minimum is the one end that is always offered.
      return { numericValue: opinionScaleMinimum(question) };
    case 'Checkbox':
    case 'Legal':
      return { booleanValue: true };
    case 'Ranking':
      // Every offered option exactly once, in the order offered — the only ranking that is valid
      // whatever the options are.
      return optionValues(question).length > 0 ? { jsonValue: JSON.stringify(optionValues(question)) } : null;
    case 'Address':
      return { jsonValue: JSON.stringify({ line1: '1 Smoke Street', city: 'Testville', postalCode: '00000' }) };
    case 'ContactInfo':
      return { jsonValue: JSON.stringify({ name: name ?? 'Smoke Check', email: email ?? 'smoke@example.com' }) };
    case 'ShortText':
    case 'LongText':
      return { textValue: /name/i.test(question.prompt ?? '') && name ? name : 'smoke check' };
    case 'Doodle':
    case 'FileUpload':
    case 'Matrix':
    case 'Statement':
    default:
      // DECLINE rather than guess. A Doodle, a file or a Matrix needs a real artifact or the
      // form's own rows and columns; a Statement takes no answer at all; and a type this table
      // has never heard of is one the server will validate in a way this cannot predict. Until
      // 2026-09-01 this branch sent `'smoke check'` for all of them, and the first form with a
      // Website question turned every submitting smoke red with "Enter a valid web address." —
      // a message that reads like a product defect and was the fixture lying about the form.
      // `buildAnswers` skips a declined optional question and throws on a required one.
      return null;
  }
}

/** The values a choice-bearing question offers, in the order it offers them. */
function optionValues(question) {
  return (question.options ?? []).map((o) => o.value ?? o.label).filter((v) => v !== undefined && v !== null);
}

/** The lowest point on an OpinionScale — its settings' `min`, or the contract's default of 1. */
function opinionScaleMinimum(question) {
  const raw = question.settings?.min;
  return typeof raw === 'number' ? Math.trunc(raw) : 1;
}

/**
 * A complete submission for a published form: one answer per question it can answer.
 *
 * `overrides` is keyed by question id, for the answers a caller must supply itself — an uploaded
 * file id, or a value a particular assertion depends on.
 *
 * A REQUIRED question this cannot answer throws rather than submitting something the server will
 * reject: "missing required value" from a smoke run reads as a product defect, and every time it
 * has actually meant the fixture could not describe the form.
 */
export function buildAnswers(questions, { email, name, overrides = {} } = {}) {
  const answers = [];
  for (const q of questions) {
    if (Object.prototype.hasOwnProperty.call(overrides, q.id)) {
      answers.push({ questionId: q.id, ...overrides[q.id] });
      continue;
    }
    const answer = answerFor(q, { email, name });
    if (answer) {
      answers.push({ questionId: q.id, ...answer });
    } else if (q.isRequired) {
      throw new Error(
        `Question "${q.prompt}" (${q.type}) is required on this form and a smoke run cannot ` +
          'synthesise a value for it. Pass a slug whose required questions are all answerable, or ' +
          'supply this one through `overrides`.',
      );
    }
  }
  return answers;
}

/** Single-quote escaping for values interpolated into these fixtures' SQL. */
function escape(value) {
  return String(value).replace(/'/g, "''");
}
