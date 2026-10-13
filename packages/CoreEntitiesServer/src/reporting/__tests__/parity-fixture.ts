/**
 * One form's worth of responses that exercises every rule the reporting summary carries over from
 * the dashboard: every charted role, every profile and written-answer type, a welcome page with
 * nothing to answer, Partial and Disqualified responses (which the headline and insights exclude and
 * the funnel counts), an implausible sitting (an epoch StartedAt), an NPS rating off its scale,
 * off-list choice values, a duplicate email across two questions, and answers to a question deleted
 * since publishing. Shared by the fake-provider parity spec and the opt-in real-database one.
 *
 * Ids are GUID-shaped: the engine refuses any other id, and SQL Server stores no other.
 */
import type { PublishedFormDefinition, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import { makeDefinition } from '../../testing/index.js';

/** A stable GUID in the fixture's own range, so a test reads `gid(12)` rather than a literal. */
export function gid(n: number, prefix = '0f0f0f0f'): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const FORM_ID = gid(1);
export const VERSION_ID = gid(2);

/** Question ids by role in the fixture. */
export const Q = {
  intro: gid(100),
  name: gid(101),
  email: gid(102),
  phone: gid(103),
  contact: gid(104),
  address: gid(105),
  colour: gid(110),
  toppings: gid(111),
  rating: gid(112),
  nps: gid(113),
  yesno: gid(114),
  legal: gid(115),
  date: gid(116),
  time: gid(117),
  matrix: gid(118),
  essay: gid(119),
  upload: gid(120),
  count: gid(130),
} as const;

/** A question deleted after publishing: its answers exist, the labels do not. */
export const DELETED_QUESTION = gid(199);

function q(id: string, type: PublishedFormQuestion['type'], prompt: string, displayOrder: number, options: { value: string; label: string; matrixAxis?: 'Row' | 'Column' }[] = []): PublishedFormQuestion {
  return {
    id,
    type,
    prompt,
    isRequired: false,
    displayOrder,
    options: options.map((o, i) => ({ id: `${id.slice(0, 30)}${String(i).padStart(6, '0')}`, displayOrder: i + 1, ...o })),
  };
}

export const DEFINITION: PublishedFormDefinition = makeDefinition({
  formId: FORM_ID,
  formVersionId: VERSION_ID,
  name: 'Parity fixture',
  pages: [
    { id: gid(10), title: 'Welcome', displayOrder: 0, questions: [q(Q.intro, 'Statement', 'Hello', 1)] },
    {
      id: gid(11),
      displayOrder: 1,
      questions: [
        q(Q.name, 'ShortText', 'Full name', 1),
        q(Q.email, 'Email', 'Email', 2),
        q(Q.phone, 'Phone', 'Phone', 3),
        q(Q.contact, 'ContactInfo', 'Contact details', 4),
        q(Q.address, 'Address', 'Address', 5),
      ],
    },
    {
      id: gid(12),
      title: 'Opinions',
      displayOrder: 2,
      questions: [
        q(Q.colour, 'SingleChoice', 'Favourite colour', 1, [
          { value: 'r', label: 'Red' },
          { value: 'g', label: 'Green' },
          { value: 'b', label: 'Blue' },
        ]),
        q(Q.toppings, 'MultiChoice', 'Toppings', 2, [
          { value: 'cheese', label: 'Cheese' },
          { value: 'olive', label: 'Olive' },
        ]),
        q(Q.rating, 'Rating', 'Rate us', 3),
        q(Q.nps, 'NPS', 'Recommend us?', 4),
        q(Q.yesno, 'YesNo', 'Would you return?', 5),
        q(Q.legal, 'Legal', 'Terms', 6),
        q(Q.date, 'Date', 'Start date', 7),
        q(Q.time, 'Time', 'Best time', 8),
        q(Q.matrix, 'Matrix', 'Rate each', 9, [
          { value: 'venue', label: 'Venue', matrixAxis: 'Row' },
          { value: 'food', label: 'Food', matrixAxis: 'Row' },
          { value: 'good', label: 'Good', matrixAxis: 'Column' },
          { value: 'poor', label: 'Poor', matrixAxis: 'Column' },
        ]),
        q(Q.essay, 'LongText', 'Anything else?', 10),
        q(Q.upload, 'FileUpload', 'Your CV', 11),
      ],
    },
    { id: gid(13), title: 'Extra', displayOrder: 3, questions: [q(Q.count, 'Number', 'How many?', 1)] },
  ],
});

/** A response row, with the columns the reads select. */
export interface FixtureResponse {
  ID: string;
  FormID: string;
  FormVersionID: string;
  Status: 'Complete' | 'Partial' | 'Disqualified';
  StartedAt: Date | null;
  SubmittedAt: Date | null;
  RespondentPersonID: string | null;
  RespondentPerson: string | null;
  AnonymousSessionID: string;
}

/** An answer row, with every value column. */
export interface FixtureAnswer {
  ID: string;
  ResponseID: string;
  QuestionID: string;
  TextValue: string | null;
  NumericValue: number | null;
  DateValue: Date | null;
  BooleanValue: boolean | null;
  JSONValue: string | null;
  FileID: string | null;
}

const at = (iso: string): Date => new Date(iso);

function response(n: number, status: FixtureResponse['Status'], started: string | null, submitted: string | null): FixtureResponse {
  return {
    ID: gid(1000 + n),
    FormID: FORM_ID,
    FormVersionID: VERSION_ID,
    Status: status,
    StartedAt: started ? at(started) : null,
    SubmittedAt: submitted ? at(submitted) : null,
    RespondentPersonID: null,
    RespondentPerson: null,
    AnonymousSessionID: `session-${n}`,
  };
}

export const RESPONSES: FixtureResponse[] = [
  response(1, 'Complete', '2026-09-01T10:00:00Z', '2026-09-01T10:02:00Z'),
  response(2, 'Complete', '2026-09-02T10:00:00Z', '2026-09-02T10:05:00Z'),
  response(3, 'Complete', '1970-01-01T00:00:00Z', '2026-09-03T09:00:00Z'),
  response(4, 'Complete', '2026-09-04T10:00:00Z', '2026-09-04T10:03:00Z'),
  response(5, 'Complete', '2026-09-05T10:00:00Z', '2026-09-05T10:01:30Z'),
  response(6, 'Partial', '2026-09-06T10:00:00Z', null),
  response(7, 'Partial', '2026-09-07T10:00:00Z', null),
  response(8, 'Disqualified', '2026-09-08T10:00:00Z', '2026-09-08T10:01:00Z'),
];

let answerSeq = 0;

function answer(responseN: number, questionId: string, columns: Partial<Omit<FixtureAnswer, 'ID' | 'ResponseID' | 'QuestionID'>>): FixtureAnswer {
  answerSeq += 1;
  return {
    ID: gid(5000 + answerSeq),
    ResponseID: gid(1000 + responseN),
    QuestionID: questionId,
    TextValue: null,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
    ...columns,
  };
}

export const ANSWERS: FixtureAnswer[] = [
  // r1: complete, everything
  answer(1, Q.name, { TextValue: 'Ada Lovelace' }),
  answer(1, Q.email, { TextValue: 'ada@example.org' }),
  answer(1, Q.phone, { TextValue: '+44 7700 900001' }),
  answer(1, Q.contact, { JSONValue: JSON.stringify({ firstName: 'Ada', email: 'ada@example.org', company: 'Analytical Engines' }) }),
  answer(1, Q.address, { JSONValue: JSON.stringify({ line1: '12 Row', city: 'London', country: 'UK' }) }),
  answer(1, Q.colour, { TextValue: 'g' }),
  answer(1, Q.toppings, { JSONValue: JSON.stringify(['cheese', 'olive']) }),
  answer(1, Q.rating, { NumericValue: 5 }),
  answer(1, Q.nps, { NumericValue: 10 }),
  answer(1, Q.yesno, { BooleanValue: true }),
  answer(1, Q.legal, { BooleanValue: true }),
  answer(1, Q.date, { DateValue: at('2026-09-01T00:00:00Z') }),
  answer(1, Q.time, { DateValue: at('1970-01-01T14:30:00Z') }),
  answer(1, Q.matrix, { JSONValue: JSON.stringify({ venue: 'good', food: 'poor' }) }),
  answer(1, Q.essay, { TextValue: 'The pricing page was confusing and the checkout slow' }),
  answer(1, Q.upload, { FileID: gid(9001) }),
  // r2: complete; an off-list colour and a consumer mailbox
  answer(2, Q.name, { TextValue: 'Grace Hopper' }),
  answer(2, Q.email, { TextValue: 'grace@gmail.com' }),
  answer(2, Q.colour, { TextValue: 'mauve' }),
  answer(2, Q.toppings, { JSONValue: JSON.stringify(['cheese', null, ' ']) }),
  answer(2, Q.rating, { NumericValue: 3 }),
  answer(2, Q.nps, { NumericValue: 6 }),
  answer(2, Q.yesno, { BooleanValue: false }),
  answer(2, Q.legal, { BooleanValue: true }),
  answer(2, Q.date, { DateValue: at('2026-10-15T00:00:00Z') }),
  answer(2, Q.time, { DateValue: at('1970-01-01T08:00:00Z') }),
  answer(2, Q.matrix, { JSONValue: JSON.stringify({ venue: ['good', 'poor'] }) }),
  answer(2, Q.essay, { TextValue: 'Checkout was slow; pricing fine' }),
  // r3: complete with an implausible sitting; NPS off its scale; the same person as r1
  answer(3, Q.email, { TextValue: 'Ada@Example.org' }),
  answer(3, Q.colour, { TextValue: 'r' }),
  answer(3, Q.toppings, { JSONValue: '[]' }),
  answer(3, Q.nps, { NumericValue: 99 }),
  answer(3, Q.yesno, { BooleanValue: true }),
  answer(3, Q.address, { JSONValue: JSON.stringify({ city: 'Paris', country: 'FR' }) }),
  answer(3, Q.essay, { TextValue: 'n/a' }),
  // r4: complete; a deleted question's answer, which no label maps
  answer(4, Q.colour, { TextValue: 'g' }),
  answer(4, Q.nps, { NumericValue: 8 }),
  answer(4, Q.rating, { NumericValue: 4 }),
  answer(4, DELETED_QUESTION, { TextValue: 'orphaned answer' }),
  answer(4, Q.contact, { JSONValue: JSON.stringify({ email: 'linus@kernel.example', phone: '555' }) }),
  // r5: complete; only the first page
  answer(5, Q.name, { TextValue: 'Alan Turing' }),
  answer(5, Q.email, { TextValue: 'alan@example.org' }),
  // r6: partial, got as far as the opinions page
  answer(6, Q.name, { TextValue: 'Partial Person' }),
  answer(6, Q.colour, { TextValue: 'b' }),
  answer(6, Q.essay, { TextValue: 'pricing pricing pricing' }),
  // r7: partial, first page only
  answer(7, Q.email, { TextValue: 'partial@example.org' }),
  // r8: disqualified on the opinions page
  answer(8, Q.colour, { TextValue: 'b' }),
  answer(8, Q.yesno, { BooleanValue: false }),
];
