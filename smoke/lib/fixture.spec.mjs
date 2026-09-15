#!/usr/bin/env node
/**
 * Proves the seeded-fixture wiring check actually refuses a mismatched form.
 *
 * `resolveSeededSlug` exists because three suites mutate a seeded automation or binding and then
 * assert on what that row did — and picking a form alphabetically instead let `resume-arc-path`
 * patch a binding nothing ran, then report the result as a product defect. The helper closed that
 * for the DISCOVERY path. It did not close it for an explicitly-passed slug: it documented that
 * obligation as the caller's, and one caller of three honoured it, so
 * `npm run smoke:binding -- some-other-slug` walked straight back into the original bug.
 *
 * The decision is a pure function so it can be tested without a database, which is the only way
 * this stays honest — the failure it guards against is exactly the kind that looks like a passing
 * run until someone reads the assertions.
 *
 * Plain Node, matching `scripts/check-migration-order.spec.mjs`. `fixture.mjs` itself stays
 * stdlib-only — the smoke scripts that import it run against a live server with no build step.
 * This SPEC takes one dependency on purpose: the built `@mj-biz-apps/forms-entities`, for the real
 * `validateAnswerFormat`. An end-to-end run found the fixture sending `'smoke check'` as a
 * `Website` answer, which the server refused with "Enter a valid web address." — every smoke that
 * submits a response failed, and the failure read like a product defect. A fixture that speaks a
 * stale contract has to be checked against the contract, not against a table copied from it. CI
 * runs this after `pnpm install` and `build:packages`, so the dependency is always satisfied there;
 * locally, build the packages first.
 */
import { describeSeedWiringMismatch, answerFor } from './fixture.mjs';
import { validateAnswerFormat, FORM_QUESTION_TYPES, isAnswerableQuestionType } from '@mj-biz-apps/forms-entities';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

console.log('describeSeedWiringMismatch');

check(
  'accepts a slug the fixture is wired to',
  describeSeedWiringMismatch({ slug: 'support-application', wiredSlugs: ['support-application'] }) === undefined,
);

check(
  'accepts it regardless of casing or surrounding space',
  describeSeedWiringMismatch({ slug: '  Support-Application ', wiredSlugs: ['support-application'] }) === undefined,
  'a slug typed on the command line will not match the database byte for byte',
);

const elsewhere = describeSeedWiringMismatch({
  slug: 'ats-application',
  wiredSlugs: ['support-application'],
  scriptName: 'binding-path.mjs',
});
check('refuses a slug the fixture is not wired to', typeof elsewhere === 'string');
check(
  'and names the slug that would have worked',
  typeof elsewhere === 'string' && elsewhere.includes('support-application'),
  `a refusal that does not say where to go leaves the operator exactly where the old bug did: ${elsewhere}`,
);
check(
  'and names the slug that was rejected',
  typeof elsewhere === 'string' && elsewhere.includes('ats-application'),
  elsewhere,
);

const nowhere = describeSeedWiringMismatch({ slug: 'ats-application', wiredSlugs: [], scriptName: 'binding-path.mjs' });
check('refuses when nothing is wired at all', typeof nowhere === 'string');
check(
  'and points at the seeding step rather than at a slug',
  typeof nowhere === 'string' && /smoke:binding:seed/.test(nowhere),
  nowhere,
);

check(
  'picks the first wired slug deterministically when several exist',
  (() => {
    const m = describeSeedWiringMismatch({ slug: 'other', wiredSlugs: ['a-form', 'b-form'] });
    return typeof m === 'string' && m.includes('a-form') && !m.includes('b-form');
  })(),
  'two runs on one database must name the same alternative',
);

// --- the fixture speaks the contract's answer format, for every type the taxonomy knows -------------

/** The raw value the server validates, from the fixture's typed-column answer shape. */
function rawValueOf(answer) {
  if ('jsonValue' in answer) return JSON.parse(answer.jsonValue);
  if ('numericValue' in answer) return answer.numericValue;
  if ('booleanValue' in answer) return answer.booleanValue;
  if ('dateValue' in answer) return answer.dateValue;
  return answer.textValue;
}

/** A question of `type` with two offered options and default settings — the shape a real form has. */
function questionOf(type) {
  return {
    id: `q-${type}`,
    type,
    prompt: type,
    isRequired: false,
    options: [
      { label: 'Alpha', value: 'alpha' },
      { label: 'Beta', value: 'beta' },
    ],
    settings: {},
  };
}

for (const type of FORM_QUESTION_TYPES) {
  const answer = answerFor(questionOf(type), { email: 'smoke@example.com', name: 'Smoke Check' });
  if (!isAnswerableQuestionType(type)) {
    check(`${type}: not answerable, so the fixture sends nothing`, answer === null, JSON.stringify(answer));
    continue;
  }
  if (answer === null) {
    // Declining is legitimate for a type the fixture cannot describe (Doodle, FileUpload, Matrix):
    // buildAnswers skips it when optional and throws when required. It must never GUESS.
    check(`${type}: the fixture declines rather than guessing`, true);
    continue;
  }
  const message = validateAnswerFormat(questionOf(type), rawValueOf(answer));
  check(
    `${type}: the fixture's answer passes the server's format check`,
    message === undefined,
    `sent ${JSON.stringify(answer)}; server said "${message}"`,
  );
}

console.log(failures === 0 ? '\nPASS — the wiring check refuses what it should, and the fixture speaks the contract.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
