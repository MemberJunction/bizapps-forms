/**
 * The few decisions about reading responses that the server and the dashboard must make the same way.
 *
 * `Forms.GetResponseSummary`, `Forms.ListResponses` and `Forms.GetResponseDetail` (#303) compute on
 * the server, and the dashboard renders what they return. Two things cross that line as VALUES the
 * browser has to recognise, so each lives here once instead of as a server constant and a client
 * literal that drift apart:
 *  - the page size: the server lowers any larger `MaxRows` to it, and a client that asks for more
 *    would believe a short page meant the end of the list;
 *  - the label under which the summary counts answers outside a question's options.
 * (A summary refused to its caller is NOT recognised by text: the operation refuses it as `FORBIDDEN`.)
 */

/** The most responses one `Forms.ListResponses` page returns; a larger `MaxRows` is lowered to it. */
export const MAX_RESPONSE_PAGE_SIZE = 200;

/**
 * The longest `Forms.ListResponses` search the server accepts. It is a name, an email or a phrase
 * from an answer, never a document; the client's search box carries the same `maxlength`.
 */
export const MAX_RESPONSE_SEARCH_LENGTH = 100;

/**
 * The bucket (and Matrix row or column) label under which `Forms.GetResponseSummary` counts every
 * answer value outside the question's options. Such a value can be anything a client sent, so it is
 * never shipped as its own text. Worded so it cannot collide with an author's own "Other" option.
 */
export const OFF_LIST_LABEL = 'Other (not an option)';
