/**
 * What an automation run's stored `OutputSummary` says, in words a form owner can read.
 *
 * The dispatcher stores the column as a JSON object, `{"summary": "<text>"}` (`dispatch-automation.ts`
 * `saveClosed`, its only writer), and the text often names records by id: an action's own message
 * ("Linked existing Person <id> for response <id>"), a binding's outcome ("Created <id>"). Both
 * surfaces that show a run — the response detail's "What this submission did" and the Automate tab's
 * run list — printed the column as it is. This decodes the envelope and removes the ids, which no
 * reader can use there: the record a binding wrote has its own "Open record" link, and an agent run
 * its own button.
 *
 * It is a pure display mapping, called for every row on every render of those lists, so it logs
 * nothing: a value that is not the envelope is simply shown as the text it is.
 */

const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** The readable summary, or null when there is nothing worth showing. */
export function runOutputText(stored: string | null): string | null {
  if (!stored) {
    return null;
  }
  const text = summaryOf(stored);
  if (text === null) {
    return null;
  }
  const readable = text
    .replace(GUID, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return readable === '' ? null : readable;
}

/**
 * The text inside the envelope; anything that is not an envelope, as the text it is; null for an
 * envelope without a string `summary`. Only a value starting with `{` can be the envelope — the
 * writer always stores an object — so text that starts with `[` is never parsed.
 */
function summaryOf(stored: string): string | null {
  const trimmed = stored.trim();
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }
  const envelope = parseObject(trimmed);
  if (envelope === undefined) {
    return trimmed;
  }
  const summary = envelope.summary;
  return typeof summary === 'string' ? summary : null;
}

/**
 * The parsed object, or `undefined` when the text is not a JSON object. A SyntaxError here is the
 * answer "this is text, not the envelope", not a failure: the caller shows the text. Any other error
 * is unexpected and propagates.
 */
function parseObject(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return undefined;
    }
    throw err;
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}
