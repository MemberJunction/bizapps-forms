/**
 * The alert text for a failed load, save or export: what was being done, then why it failed.
 *
 * Both the reporting dashboard and Forms home used to show the thrown message INSTEAD of the
 * action whenever a real Error arrived, so the context sentence was discarded for every real
 * failure and the reader was left with a transport string ("GraphQL Error (Code: unknown)")
 * that says nothing about what failed. The action is always kept; the error's message is
 * appended only when it has one.
 */
export function failureMessage(err: unknown, action: string): string {
  const detail = err instanceof Error ? err.message.trim() : '';
  if (!detail) return action;
  return `${action.replace(/\.$/, '')}: ${detail}`;
}
