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
 * Plain Node, matching `scripts/check-migration-order.spec.mjs`: these fixtures are stdlib-only so
 * they run without an install, and their tests must not reintroduce that dependency.
 */
import { describeSeedWiringMismatch } from './fixture.mjs';

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

console.log(failures === 0 ? '\nPASS — the wiring check refuses what it should.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
