/**
 * How `FormReportingEngine` says "no" — in a module of its own so the query, row-read and engine
 * modules share it without importing each other.
 */

/**
 * A report that could not be produced. `fault: true` when the system failed (a read, a query, a
 * snapshot that will not parse) — logged as an error; otherwise a refusal over what was asked (a
 * form or response that does not exist, an id that is not one) — logged as a status.
 *
 * `message` is what the caller sees (an operation returns it as `ErrorMessage`), so it never carries
 * provider, SQL or exception text: that goes in `logDetail`, which `runEngineCall` appends to the one
 * log line it writes.
 */
export class FormReportingError extends Error {
  public readonly fault: boolean;
  public readonly logDetail?: string;

  constructor(message: string, options: { fault?: boolean; logDetail?: string } = {}) {
    super(message);
    this.name = 'FormReportingError';
    this.fault = options.fault === true;
    this.logDetail = options.logDetail;
  }
}
