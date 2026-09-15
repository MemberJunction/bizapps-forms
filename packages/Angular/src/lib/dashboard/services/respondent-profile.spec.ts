/**
 * The profile's contract, and the privacy property it exists to hold.
 *
 * The load-bearing test is the last one: no answer VALUE may appear anywhere in the returned
 * model. Everything else here is arithmetic; that one is the reason the module exists, and it
 * is the assertion that fails if someone later "improves" the panel by surfacing an example.
 */
import { describe, expect, it } from 'vitest';
import { buildRespondentProfile } from './respondent-profile';
import { q, answer } from '../../shared/testing/entity-row-fixtures';

const email = q('qe', 'Email', 0);
const phone = q('qp', 'Phone', 1);
const contact = q('qc', 'ContactInfo', 2);
const address = q('qa', 'Address', 3);
const doodle = q('qs', 'Doodle', 4);
const choice = q('qch', 'SingleChoice', 5);

describe('contact coverage', () => {
  it('counts how many responses can be reached, against the RESPONSE count', () => {
    // Not against the answer count: "did the people who submitted give us an email" is the
    // question, so a skipped question has to count against the rate.
    const profile = buildRespondentProfile(
      [email],
      [answer('r1', 'qe', { TextValue: 'a@x.com' }), answer('r2', 'qe', { TextValue: 'b@x.com' })],
      4,
    );
    const contactable = profile.metrics.find((m) => m.label === 'Contactable')!;
    expect(contactable.value).toBe('2');
    expect(contactable.fraction).toBe(0.5);
  });

  it('counts distinct people and names the repeats', () => {
    // A form linked from a newsletter collects the same person twice, and every per-person
    // rate on the page is wrong if nobody says so.
    const profile = buildRespondentProfile(
      [email],
      [
        answer('r1', 'qe', { TextValue: 'same@x.com' }),
        answer('r2', 'qe', { TextValue: 'SAME@x.com ' }),
        answer('r3', 'qe', { TextValue: 'other@x.com' }),
      ],
      3,
    );
    const distinct = profile.metrics.find((m) => m.label === 'Distinct people')!;
    expect(distinct.value).toBe('2');
    expect(distinct.detail).toMatch(/1 submitted more than once/);
  });

  it('ignores text that is not an address rather than counting it as one', () => {
    const profile = buildRespondentProfile(
      [email],
      [answer('r1', 'qe', { TextValue: 'not an email' }), answer('r2', 'qe', { TextValue: 'a@x.com' })],
      2,
    );
    expect(profile.metrics.find((m) => m.label === 'Contactable')!.value).toBe('1');
  });

  it('splits work addresses from consumer mailboxes', () => {
    const profile = buildRespondentProfile(
      [email],
      [
        answer('r1', 'qe', { TextValue: 'a@gmail.com' }),
        answer('r2', 'qe', { TextValue: 'b@acme.co' }),
        answer('r3', 'qe', { TextValue: 'c@acme.co' }),
        answer('r4', 'qe', { TextValue: 'd@acme.co' }),
      ],
      4,
    );
    expect(profile.metrics.find((m) => m.label === 'Work addresses')!.value).toBe('75%');
  });
});

describe('counting per response, not per answer row', () => {
  it('counts a response once even when it gives an email twice', () => {
    // A form can ask for an email directly AND inside a contact block. Counted per row, one
    // response became two contactable people — which is how a live form reported
    // "Contactable: 40 of 32 responses", a sentence that cannot be true.
    const profile = buildRespondentProfile(
      [email, contact],
      [
        answer('r1', 'qe', { TextValue: 'a@x.com' }),
        answer('r1', 'qc', { JSONValue: JSON.stringify({ email: 'a@x.com' }) }),
      ],
      1,
    );
    expect(profile.metrics.find((m) => m.label === 'Contactable')!.value).toBe('1');
  });

  it('never shows a count larger than the denominator beside it', () => {
    // Answers span every published version; the denominator counts complete responses of the
    // current one. The last line of defence after the de-duplication above.
    const profile = buildRespondentProfile(
      [email],
      [
        answer('r1', 'qe', { TextValue: 'a@x.com' }),
        answer('r2', 'qe', { TextValue: 'b@x.com' }),
        answer('r3', 'qe', { TextValue: 'c@x.com' }),
      ],
      2,
    );
    const contactable = profile.metrics.find((m) => m.label === 'Contactable')!;
    expect(contactable.value).toBe('2');
    expect(contactable.fraction).toBe(1);
  });

  it('measures the work-address share over distinct addresses, not over submissions', () => {
    // One person submitting three times from the same work address should not make the form
    // look three times more corporate than it is.
    const profile = buildRespondentProfile(
      [email],
      [
        answer('r1', 'qe', { TextValue: 'dup@acme.co' }),
        answer('r2', 'qe', { TextValue: 'dup@acme.co' }),
        answer('r3', 'qe', { TextValue: 'dup@acme.co' }),
        answer('r4', 'qe', { TextValue: 'person@gmail.com' }),
      ],
      4,
    );
    expect(profile.metrics.find((m) => m.label === 'Work addresses')!.value).toBe('50%');
  });
});

describe('groupings', () => {
  it('groups by email domain, never by address', () => {
    const profile = buildRespondentProfile(
      [email],
      [
        answer('r1', 'qe', { TextValue: 'alice@acme.co' }),
        answer('r2', 'qe', { TextValue: 'bob@acme.co' }),
        answer('r3', 'qe', { TextValue: 'carol@other.io' }),
      ],
      3,
    );
    const domains = profile.distributions.find((d) => d.title === 'Email domains')!;
    expect(domains.buckets.map((b) => [b.label, b.count])).toEqual([
      ['acme.co', 2],
      ['other.io', 1],
    ]);
  });

  it('folds the tail into a labelled Other rather than implying the top six is everything', () => {
    const answers = Array.from({ length: 9 }, (_, i) =>
      answer(`r${i}`, 'qe', { TextValue: `p${i}@d${i}.com` }),
    );
    const profile = buildRespondentProfile([email], answers, 9);
    const buckets = profile.distributions[0].buckets;
    expect(buckets).toHaveLength(7);
    expect(buckets[6].label).toBe('Other (3 more)');
    expect(buckets[6].count).toBe(3);
  });

  it('does not fold a single leftover into "Other", which hides it for no gain', () => {
    // Seven domains folded into six plus "Other (1 more)" — the same number of rows, one of
    // them now anonymous. The fold has to earn its place by actually saving space.
    const answers = Array.from({ length: 7 }, (_, i) =>
      answer(`r${i}`, 'qe', { TextValue: `p${i}@d${i}.com` }),
    );
    const buckets = buildRespondentProfile([email], answers, 7).distributions[0].buckets;
    expect(buckets).toHaveLength(7);
    expect(buckets.some((b) => b.label.startsWith('Other'))).toBe(false);
  });

  it('reads country from the address question and company from contact info', () => {
    const profile = buildRespondentProfile(
      [address, contact],
      [
        answer('r1', 'qa', { JSONValue: JSON.stringify({ city: 'Leeds', country: 'UK' }) }),
        answer('r2', 'qa', { JSONValue: JSON.stringify({ country: 'UK' }) }),
        answer('r1', 'qc', { JSONValue: JSON.stringify({ company: 'Acme', email: 'z@acme.co' }) }),
      ],
      2,
    );
    expect(profile.distributions.find((d) => d.title === 'Countries')!.buckets[0]).toMatchObject({
      label: 'UK',
      count: 2,
    });
    expect(profile.distributions.find((d) => d.title === 'Organisations')!.buckets[0]).toMatchObject({
      label: 'Acme',
      count: 1,
    });
  });

  it('survives a malformed composite answer without losing the report', () => {
    const profile = buildRespondentProfile(
      [address],
      [answer('r1', 'qa', { JSONValue: '{not json' }), answer('r2', 'qa', { JSONValue: JSON.stringify({ country: 'UK' }) })],
      2,
    );
    expect(profile.metrics.find((m) => m.label === 'Address given')!.value).toBe('1');
  });
});

describe('when the section applies at all', () => {
  it('is empty for a form that asks nothing identifying', () => {
    // An anonymous survey gets no section, rather than a panel of zeroes reporting on
    // questions it never asked.
    expect(buildRespondentProfile([choice], [], 5).isEmpty).toBe(true);
  });

  it('is not empty for a form that asks, even before anyone answers', () => {
    // Emptiness is about the FORM, not the data — otherwise a new form looks like it never
    // collected contact details.
    expect(buildRespondentProfile([email], [], 0).isEmpty).toBe(false);
  });

  it('counts drawings and files separately from each other', () => {
    const profile = buildRespondentProfile(
      [doodle],
      [answer('r1', 'qs', { FileID: 'f1' }), answer('r2', 'qs', { FileID: 'f2' })],
      4,
    );
    const drawn = profile.metrics.find((m) => m.label === 'Drawing given')!;
    expect(drawn.value).toBe('2');
    expect(drawn.fraction).toBe(0.5);
  });
});

describe('no answer value ever leaves this module', () => {
  it('never surfaces an email, a phone number or a street', () => {
    // The whole point. If this fails, the dashboard is showing personal data again.
    const profile = buildRespondentProfile(
      [email, phone, address, contact],
      [
        answer('r1', 'qe', { TextValue: 'alice.smith@acme.co' }),
        answer('r1', 'qp', { TextValue: '+44 7700 900123' }),
        answer('r1', 'qa', { JSONValue: JSON.stringify({ line1: '12 Rose Lane', city: 'Leeds', country: 'UK' }) }),
        answer('r1', 'qc', { JSONValue: JSON.stringify({ firstName: 'Alice', lastName: 'Smith', email: 'alice.smith@acme.co' }) }),
      ],
      1,
    );
    const rendered = JSON.stringify(profile);
    for (const secret of ['alice.smith', 'alice', '7700', '900123', '12 Rose Lane', 'Smith']) {
      expect(rendered.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    // The domain is deliberately the one thing that survives — it describes a population.
    expect(rendered).toContain('acme.co');
  });
});
