/**
 * One spelling of "turn a caught `unknown` into something a message can carry".
 *
 * Trivial, and duplicated in eight files before it was extracted — which is the whole argument for
 * it existing: an error whose message reads `[object Object]` because one copy forgot the
 * `instanceof` check is a diagnosis nobody can make from the log it lands in.
 */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
