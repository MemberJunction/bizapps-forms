/**
 * The cause of a failure, in words for the console.
 *
 * The widget's refusal errors (`ResponseNotSavedError`, `FormUnavailableError`) keep `message` to
 * one fixed respondent-facing sentence on purpose — a prober must not learn why — and carry the
 * server's code and text in `reason`. So `String(err)` and `err.message` both log only that
 * sentence, and a FORBIDDEN or EXECUTION_ERROR on a save left nothing in the console naming it.
 * Read by shape rather than by class so this core module stays free of the API layer.
 */
export function failureDetail(err: unknown): string {
  if (err instanceof Error) {
    const reason: unknown = (err as Error & { reason?: unknown }).reason;
    return typeof reason === 'string' && reason.trim() !== '' ? reason : `${err.name}: ${err.message}`;
  }
  return String(err);
}
