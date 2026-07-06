/**
 * Pure reorder guard shared by the builder's arrow-button and drag-drop reorder paths.
 *
 * Both `moveQuestion` (keyboard/arrows) and `dropQuestion` (CDK drag) compute a source
 * and target index, then persist the page's question order the same way. This decides
 * whether a proposed move is a real, in-bounds reorder before we touch the array or the
 * database — keeping the two entry points behaviourally identical.
 */
export function isValidReorder(from: number, to: number, length: number): boolean {
  return (
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 0 &&
    from < length &&
    to >= 0 &&
    to < length &&
    from !== to
  );
}
