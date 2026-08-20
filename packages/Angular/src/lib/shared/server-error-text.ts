/**
 * Read the server's own explanation out of an error response.
 *
 * All three of this package's HTTP callers — the respondent upload, the authoring-asset upload,
 * and the response-file download — face the same question and used to answer it separately: the
 * endpoint writes `{ "error": "..." }` explaining exactly why it refused, and that sentence is
 * always better than anything the client can infer from a status code.
 *
 * They had drifted, which is the argument for this file existing. Two copies were byte-identical;
 * the third accepted only an already-parsed object (so a text-mode response silently produced no
 * message), skipped the `trim`, and fell back to `Upload failed (HTTP 415). Please try again.` —
 * a sentence naming a number that means nothing outside a spec and prescribing an action that
 * cannot work, since a 415 is a verdict on the FILE and retrying it produces the same answer
 * forever. That is precisely the failure the respondent-upload copy's own comment was written to
 * condemn, reintroduced a few files away.
 *
 * Only the EXTRACTION is shared. What to say when there is no server message stays with each
 * caller, because those situations genuinely differ — an author who cannot upload an image and a
 * respondent whose file was rejected need different sentences.
 */

/**
 * The `error` string from an endpoint's JSON body, or null when there is not one.
 *
 * Takes `unknown` because callers hand it different things and none should have to care: an XHR
 * configured with `responseType = 'json'` yields an already-parsed object, while `fetch` callers
 * and tests pass the raw text.
 */
export function serverErrorText(body: unknown): string | null {
  const parsed = typeof body === 'string' ? tryParse(body) : body;
  if (typeof parsed === 'object' && parsed !== null) {
    const error = (parsed as Record<string, unknown>)['error'];
    // A blank string is not a message; falling through to the caller's fallback beats showing
    // someone an empty error.
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim();
    }
  }
  return null;
}

/** JSON.parse that answers null instead of throwing — a proxy's HTML error page is not JSON. */
function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
