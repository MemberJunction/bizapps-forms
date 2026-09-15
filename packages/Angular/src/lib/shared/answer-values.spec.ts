/**
 * How a stored answer becomes a value the report can count.
 *
 * These run on every choice question in every breakdown, so anything they let through
 * becomes a row on a chart. The cases below are the ones where a plausible payload produced
 * a row that was not an answer at all.
 */
import { describe, expect, it } from 'vitest';
import { extractChoiceValues } from './answer-values';
import { answer } from './testing/entity-row-fixtures';

const withJson = (json: string) => answer('r', 'q', { JSONValue: json });

describe('extractChoiceValues', () => {
  it('reads a multi-select array', () => {
    expect(extractChoiceValues(withJson(JSON.stringify(['a', 'b'])))).toEqual(['a', 'b']);
  });

  it('falls back to the text column for a single choice', () => {
    expect(extractChoiceValues(answer('r', 'q', { TextValue: 'a' }))).toEqual(['a']);
  });

  it('drops null and undefined entries instead of stringifying them', () => {
    // `String(null)` is `"null"`, and a value not in the option list becomes its own bucket
    // labelled by that value — so a single null in a stored array put a chart row reading
    // "null" in front of the reader, counted and coloured like a real option.
    expect(extractChoiceValues(withJson('[null, "a"]'))).toEqual(['a']);
    expect(extractChoiceValues(withJson('[null]'))).toEqual([]);
  });

  it('drops entries that are empty or whitespace once stringified', () => {
    expect(extractChoiceValues(withJson('["", "  ", "a"]'))).toEqual(['a']);
  });

  it('keeps a numeric option value, which is a legitimate choice', () => {
    // Option values are strings in the schema, but a JSON payload can carry numbers, and
    // `0` in particular must survive — it is a real option, not an absence.
    expect(extractChoiceValues(withJson('[0, 1]'))).toEqual(['0', '1']);
  });

  it('treats a non-array JSON payload as no selection', () => {
    expect(extractChoiceValues(withJson('{"x":1}'))).toEqual([]);
    expect(extractChoiceValues(withJson('"a"'))).toEqual([]);
  });

  it('falls through to the text column when the JSON will not parse', () => {
    expect(extractChoiceValues(answer('r', 'q', { JSONValue: 'not json', TextValue: 'a' }))).toEqual(['a']);
  });

  it('has nothing to report for an empty answer', () => {
    expect(extractChoiceValues(answer('r', 'q', { TextValue: '' }))).toEqual([]);
  });
});
