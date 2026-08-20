import { describe, it, expect } from 'vitest';
import { MAX_IMPORTED_QUESTIONS, parseImportedQuestions } from './question-import';

/** Flatten to one list — most assertions do not care which page a question landed on. */
function flat(text: string) {
  return parseImportedQuestions(text).pages.flatMap((p) => p.questions);
}

describe('parseImportedQuestions', () => {
  it('makes one short-text question per line', () => {
    const questions = flat('What is your name?\nWhere do you live?');
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ prompt: 'What is your name?', type: 'ShortText', isRequired: false });
  });

  it('ignores blank lines, which every real paste is full of', () => {
    expect(flat('One\n\n\n   \nTwo')).toHaveLength(2);
  });

  it('marks a trailing asterisk required and keeps it out of the prompt', () => {
    const [q] = flat('Email address *');
    expect(q).toMatchObject({ prompt: 'Email address', isRequired: true });
  });

  it('reads the required marker on either side of a type tag', () => {
    // `Prompt [type] *` used to leave the asterisk where the options go, producing a
    // single-option choice list literally called "*".
    expect(flat('Colour [choice] *')[0]).toMatchObject({ isRequired: true, options: [] });
    expect(flat('Colour * [choice]')[0]).toMatchObject({ isRequired: true, options: [] });
  });

  it('starts a new page at a # heading', () => {
    const result = parseImportedQuestions('Name\n# About you\nAge\nCity');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].title).toBeUndefined();
    expect(result.pages[1].title).toBe('About you');
    expect(result.pages[1].questions).toHaveLength(2);
  });

  it('drops a heading with nothing under it', () => {
    // An empty page publishes as a blank screen with a Next button.
    const result = parseImportedQuestions('Name\n# Empty section\n');
    expect(result.pages).toHaveLength(1);
  });

  it('reads options after a type tag and splits on the pipe', () => {
    const [q] = flat('Favourite colour [choice] red | green | blue');
    expect(q).toMatchObject({ prompt: 'Favourite colour', type: 'SingleChoice' });
    expect(q.options).toEqual(['red', 'green', 'blue']);
  });

  it('infers a choice question when options survive an unrecognised tag', () => {
    // The reachable path for "options but no resolved type": the tag is a typo, so the options
    // are all that is left to go on — and a pipe-separated list after a prompt can only be a
    // choice.
    const [q] = flat('Size [wat] small | large');
    expect(q.type).toBe('SingleChoice');
    expect(q.options).toEqual(['small', 'large']);
  });

  it('accepts canonical contract type names case-insensitively', () => {
    expect(flat('Sign here [signature]')[0].type).toBe('Signature');
    expect(flat('Sign here [SIGNATURE]')[0].type).toBe('Signature');
    expect(flat('Rate us [OpinionScale]')[0].type).toBe('OpinionScale');
  });

  it('accepts the aliases for names nobody guesses right', () => {
    expect(flat('Pick one [choice] a | b')[0].type).toBe('SingleChoice');
    expect(flat('Pick many [multi] a | b')[0].type).toBe('MultiChoice');
    expect(flat('Your site [url]')[0].type).toBe('Website');
    expect(flat('Tell us more [paragraph]')[0].type).toBe('LongText');
  });

  it('falls back to short text for an unrecognised tag rather than dropping the question', () => {
    // A typo in a tag should cost the author a type, not the line.
    const [q] = flat('Something [wat]');
    expect(q).toMatchObject({ prompt: 'Something', type: 'ShortText' });
  });

  it('infers only from unmistakable wording', () => {
    expect(flat('Email address')[0].type).toBe('Email');
    expect(flat('Mobile number')[0].type).toBe('Phone');
    expect(flat('Your website')[0].type).toBe('Website');
    expect(flat('Postal address')[0].type).toBe('Address');
    expect(flat('How many guests?')[0].type).toBe('Number');
    expect(flat('How likely are you to recommend us?')[0].type).toBe('NPS');
    // Deliberately NOT inferred — "when" is not enough to justify guessing Date.
    expect(flat('When did you first hear about us?')[0].type).toBe('ShortText');
  });

  it('lets an explicit tag beat the inference', () => {
    expect(flat('Email address [long]')[0].type).toBe('LongText');
  });

  it('caps a runaway paste and says so rather than truncating silently', () => {
    const text = Array.from({ length: MAX_IMPORTED_QUESTIONS + 25 }, (_, i) => `Q${i}`).join('\n');
    const result = parseImportedQuestions(text);
    expect(result.count).toBe(MAX_IMPORTED_QUESTIONS);
    expect(result.truncatedAt).toBe(MAX_IMPORTED_QUESTIONS);
  });

  it('reports no truncation for an ordinary paste', () => {
    expect(parseImportedQuestions('One\nTwo').truncatedAt).toBeUndefined();
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(parseImportedQuestions('').pages).toEqual([]);
    expect(parseImportedQuestions('   \n\n  ').count).toBe(0);
  });
});
