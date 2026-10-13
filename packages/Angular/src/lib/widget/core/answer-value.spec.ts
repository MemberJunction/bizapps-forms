import { describe, it, expect } from 'vitest';
import { dateAnswerInstant, dateAnswerText, FORM_QUESTION_TYPES, validateAnswers } from '@mj-biz-apps/forms-entities/contracts';
import type { AnswerValue, FormQuestionType, PublishedFormQuestion } from '@mj-biz-apps/forms-entities/contracts';
import { toAnswerInputs } from './answer-value';

function q(id: string, type: PublishedFormQuestion['type']): PublishedFormQuestion {
  return { id, type, prompt: id, isRequired: false, displayOrder: 1, options: [] };
}

describe('toAnswerInputs', () => {
  it('routes each value into the correct typed column', () => {
    const questions = [
      q('text', 'ShortText'),
      q('num', 'Number'),
      q('rate', 'Rating'),
      q('yn', 'YesNo'),
      q('date', 'Date'),
      q('multi', 'MultiChoice'),
      q('file', 'FileUpload'),
    ];
    const answers = new Map<string, AnswerValue>([
      ['text', 'hello'],
      ['num', 42],
      ['rate', 5],
      ['yn', true],
      ['date', '2026-01-01'],
      ['multi', ['a', 'b']],
      ['file', 'file-123'],
    ]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'text', textValue: 'hello' },
      { questionId: 'num', numericValue: 42 },
      { questionId: 'rate', numericValue: 5 },
      { questionId: 'yn', booleanValue: true },
      { questionId: 'date', dateValue: '2026-01-01' },
      { questionId: 'multi', jsonValue: ['a', 'b'] },
      { questionId: 'file', fileId: 'file-123' },
    ]);
  });

  // Documents the contract rather than having driven a change: the widget already sent this.
  // It is pinned because the wire format for a Time is now decided in `answer-date.ts`
  // (forms-entities), and the server refuses anything else — so a future "helpful" conversion
  // here (to an ISO instant, say) would make every Time answer unsubmittable again (#116).
  it('sends a Time answer as the bare clock reading its control emits — the contract wire format', () => {
    const answers = new Map<string, AnswerValue>([['when', '14:30']]);
    expect(toAnswerInputs([q('when', 'Time')], answers)).toEqual([{ questionId: 'when', dateValue: '14:30' }]);
  });

  it('skips unanswered and Statement questions', () => {
    const questions = [q('a', 'ShortText'), q('s', 'Statement'), q('b', 'ShortText')];
    const answers = new Map<string, AnswerValue>([['a', 'x'], ['s', 'ignored'], ['b', '']]);
    expect(toAnswerInputs(questions, answers)).toEqual([{ questionId: 'a', textValue: 'x' }]);
  });
});

/**
 * Control → wire → stored → text → control.
 *
 * Cross-session resume does not exist yet (`autosave-controller.ts`: "cross-session resume is
 * Phase 2"), so nothing reads a stored answer back into a control today. When it lands, the value
 * put back has to be one the control accepts: `<input type="time">` and `<input type="date">`
 * silently blank anything else, so hydrating from the raw stored instant would wipe the answer with
 * no error. This closes the loop now, on the real widget encoder, so whoever writes that path finds
 * the guarantee already proven rather than having to know it.
 */
describe('a date-column answer survives the whole round trip, for the resume path that is coming', () => {
  const cases: [PublishedFormQuestion['type'], string][] = [
    ['Time', '14:30'],
    ['Time', '09:05'],
    ['Time', '00:00'],
    ['Time', '23:59'],
    ['Date', '2026-09-01'],
    ['Date', '2026-03-07'],
  ];

  for (const [type, entered] of cases) {
    it(`${type} "${entered}" comes back as itself`, () => {
      const answers = new Map<string, AnswerValue>([['q', entered]]);

      // What the control emits is what the widget puts on the wire, untouched.
      const [wire] = toAnswerInputs([q('q', type)], answers);
      expect(wire.dateValue).toBe(entered);

      // What the server stores from that wire value...
      const stored = dateAnswerInstant(type, wire.dateValue as string);
      expect(stored).toBeInstanceOf(Date);

      // ...reads back as exactly what the respondent typed, which is a value the control accepts.
      expect(dateAnswerText(type, stored as Date)).toBe(entered);
    });
  }
});

describe('toAnswerInputs — the types added with element parity', () => {
  it('routes every new type by its declared column, not by a name in a switch', () => {
    const questions = [
      q('web', 'Website'),
      q('scale', 'OpinionScale'),
      q('consent', 'Checkbox'),
      q('legal', 'Legal'),
      q('pic', 'PictureChoice'),
      q('rank', 'Ranking'),
      q('draw', 'Doodle'),
    ];
    const answers = new Map<string, AnswerValue>([
      ['web', 'https://example.com'],
      ['scale', 7],
      ['consent', true],
      ['legal', false],
      ['pic', 'workshop'],
      ['rank', ['a', 'b']],
      ['draw', 'file-doodle'],
    ]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'web', textValue: 'https://example.com' },
      { questionId: 'scale', numericValue: 7 },
      { questionId: 'consent', booleanValue: true },
      { questionId: 'legal', booleanValue: false },
      { questionId: 'pic', textValue: 'workshop' },
      { questionId: 'rank', jsonValue: ['a', 'b'] },
      { questionId: 'draw', fileId: 'file-doodle' },
    ]);
  });

  it('sends a composite through as the object it is', () => {
    // The old `default: textValue: String(value)` branch is exactly what this replaces: an
    // Address would have been persisted as the literal string "[object Object]", as a complete
    // answer, with nothing anywhere reporting a problem.
    const questions = [q('addr', 'Address'), q('grid', 'Matrix')];
    const answers = new Map<string, AnswerValue>([
      ['addr', { line1: '1 High St', city: 'Leeds' }],
      ['grid', { venue: 'great' }],
    ]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'addr', jsonValue: { line1: '1 High St', city: 'Leeds' } },
      { questionId: 'grid', jsonValue: { venue: 'great' } },
    ]);
  });

  it('skips a composite whose every part is blank', () => {
    // What a focused-then-abandoned Address control leaves in the map. Sending it would write a
    // Complete answer row full of empty strings that every reader then has to treat as an
    // address.
    const questions = [q('addr', 'Address')];
    const answers = new Map<string, AnswerValue>([['addr', { line1: '', city: '' }]]);
    expect(toAnswerInputs(questions, answers)).toEqual([]);
  });

  it('keeps a composite that has any one part filled in', () => {
    const questions = [q('addr', 'Address')];
    const answers = new Map<string, AnswerValue>([['addr', { line1: '', city: 'Leeds' }]]);
    expect(toAnswerInputs(questions, answers)).toEqual([
      { questionId: 'addr', jsonValue: { line1: '', city: 'Leeds' } },
    ]);
  });

  it('skips an empty ranking rather than sending an empty array', () => {
    const questions = [q('rank', 'Ranking')];
    expect(toAnswerInputs(questions, new Map<string, AnswerValue>([['rank', []]]))).toEqual([]);
  });

  it('wraps a bare scalar reaching a json column, which is how a lone multi-select arrives', () => {
    const questions = [q('multi', 'MultiChoice')];
    expect(toAnswerInputs(questions, new Map<string, AnswerValue>([['multi', 'only']]))).toEqual([
      { questionId: 'multi', jsonValue: ['only'] },
    ]);
  });
});

describe('toAnswerInputs — numeric columns', () => {
  it('sends a blank as the text it is, never as Number(" ") === 0', () => {
    expect(toAnswerInputs([q('num', 'Number')], new Map([['num', ' ']]))).toEqual([{ questionId: 'num', textValue: ' ' }]);
  });

  it('still sends a decimal spelling as the number', () => {
    expect(toAnswerInputs([q('num', 'Number')], new Map([['num', ' 42 ']]))).toEqual([{ questionId: 'num', numericValue: 42 }]);
  });
});

/**
 * The server now refuses an answer that is not in the form its question's TYPE stores, in every mode
 * (#303 Task 8 fix round 2, `contracts/answer-shape.ts`). This pins the other side of that promise:
 * every answer THIS widget builds, for every answerable type, passes the same rule — so a respondent
 * using the real widget is never refused by it. A type added to the contract without a legitimate
 * value here fails the `Record<FormQuestionType, …>` below at compile time.
 */
describe('every answer the widget builds is in the shape the server accepts', () => {
  const choices = [
    { id: 'o1', label: 'A', value: 'a', displayOrder: 1 },
    { id: 'o2', label: 'B', value: 'b', displayOrder: 2 },
  ];
  const matrix = [
    { id: 'r1', label: 'Row', value: 'r1', displayOrder: 1, matrixAxis: 'Row' as const },
    { id: 'c1', label: 'Col 1', value: 'c1', displayOrder: 2, matrixAxis: 'Column' as const },
    { id: 'c2', label: 'Col 2', value: 'c2', displayOrder: 3, matrixAxis: 'Column' as const },
  ];
  /** One legitimate held value per type — what the widget's controls produce. `undefined`: not answerable. */
  const legitimate: Record<FormQuestionType, AnswerValue | undefined> = {
    ShortText: 'Ada Lovelace',
    LongText: 'A longer answer.',
    Email: 'ada@example.com',
    Phone: '+1 555 010 0199',
    Website: 'https://example.com',
    Number: 12.5,
    SingleChoice: 'a',
    MultiChoice: ['a', 'b'],
    Dropdown: 'b',
    PictureChoice: 'a',
    Rating: 4,
    NPS: 9,
    OpinionScale: 3,
    Ranking: ['b', 'a'],
    Matrix: { r1: 'c1' },
    YesNo: true,
    Checkbox: true,
    Legal: true,
    Date: '2026-10-13',
    Time: '14:30',
    Address: { line1: '1 Main Street', city: 'Springfield', country: 'US' },
    ContactInfo: { firstName: 'Ada', email: 'ada@example.com' },
    FileUpload: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    Doodle: 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff',
    Statement: undefined,
  };

  for (const type of FORM_QUESTION_TYPES) {
    const value = legitimate[type];
    if (value === undefined) {
      continue;
    }
    it(`${type}: the built answer passes validateAnswers in every mode`, () => {
      const options = type === 'Matrix' ? matrix : ['SingleChoice', 'MultiChoice', 'Dropdown', 'PictureChoice', 'Ranking'].includes(type) ? choices : [];
      const question: PublishedFormQuestion = { ...q('q', type), options };
      const inputs = toAnswerInputs([question], new Map([['q', value]]));
      expect(inputs).toHaveLength(1);
      const definition = {
        pages: [{ id: 'p', displayOrder: 1, questions: [question] }],
      };
      for (const mode of ['complete', 'draft', 'screened-out'] as const) {
        expect(validateAnswers(definition, inputs, mode).errors).toEqual([]);
      }
    });
  }

  it('a held number with more decimal places than the server stores is refused by the same rule, with the respondent-facing message', () => {
    const question = q('q', 'Number');
    const inputs = toAnswerInputs([question], new Map([['q', 1.23456]]));
    expect(validateAnswers({ pages: [{ id: 'p', displayOrder: 1, questions: [question] }] }, inputs, 'draft').errors).toEqual([
      { questionId: 'q', message: 'Use at most 4 decimal places.' },
    ]);
  });
});

/**
 * #303 Task 8 fix round 4 (controller ruling): a date-time with no offset is refused in every mode,
 * because the instant it names depends on the host's time zone. The widget has no date-time question
 * type: `Date` sends the bare calendar day `<input type="date">` emits and `Time` the bare clock
 * reading of `<input type="time">`, neither of which carries — or needs — an offset. Pinned so a
 * future date-time control cannot start sending a zone-less value without this failing.
 */
describe('the widget never sends a zone-less date-time (fix round 4)', () => {
  it.each([
    ['Date', '2026-10-13'],
    ['Time', '14:30'],
  ] as const)('%s goes on the wire exactly as its control emits it, and passes in every mode', (type, held) => {
    const question = q('q', type);
    const inputs = toAnswerInputs([question], new Map([['q', held]]));
    expect(inputs).toEqual([{ questionId: 'q', dateValue: held }]);
    for (const mode of ['complete', 'draft', 'screened-out'] as const) {
      expect(validateAnswers({ pages: [{ id: 'p', displayOrder: 1, questions: [question] }] }, inputs, mode).errors).toEqual([]);
    }
  });

  it('every date-column question type is one of those two', () => {
    const dateColumn = FORM_QUESTION_TYPES.filter((type) => toAnswerInputs([q('q', type)], new Map([['q', 'x']]))[0]?.dateValue !== undefined);
    expect(dateColumn).toEqual(['Date', 'Time']);
  });
});
