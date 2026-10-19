/**
 * How `FormAutomationEngine` says "no" — to an author editing a form's automation steps, and to the
 * automation drain running a response's steps.
 *
 * `message` is what a caller sees (an operation returns it as `ErrorMessage`, a handler records it
 * as the delivery's reason), so it never carries provider or database text; that rides on
 * `logDetail` to the one log line `runEngineCall` writes.
 */
export class FormAutomationError extends Error {
  /** The system failed (a read or a save) — logged as an error; otherwise a refusal over the request. */
  public readonly fault: boolean;
  /**
   * For the handler: whether delivering the same message again could succeed. A failed read could;
   * a response that does not exist, or a snapshot that cannot be read, never will.
   */
  public readonly retryable: boolean;
  public readonly logDetail?: string;

  constructor(message: string, options: { fault?: boolean; retryable?: boolean; logDetail?: string } = {}) {
    super(message);
    this.name = 'FormAutomationError';
    this.fault = options.fault === true;
    this.retryable = options.retryable === true;
    this.logDetail = options.logDetail;
  }
}
