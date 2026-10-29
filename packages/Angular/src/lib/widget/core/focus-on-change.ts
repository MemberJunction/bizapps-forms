/**
 * Decides when a renderer moves focus to its current section or question: when the item changes,
 * so keyboard and screen-reader users land on the new heading. On the first item shown it moves
 * focus only if no control outside the form already holds it — the builder's tab strip, say, or
 * a host page's own field. Each renderer instance calls this once and keeps the returned function.
 *
 * @returns `(id, focusIsElsewhere) => boolean`, true when the caller should move focus now.
 */
export function focusOnChange(): (id: string, focusIsElsewhere: boolean) => boolean {
  let lastId: string | null = null;
  return (id, focusIsElsewhere) => {
    if (id === lastId) return false;
    const first = lastId === null;
    lastId = id;
    return !(first && focusIsElsewhere);
  };
}

/**
 * Whether a control outside `host` holds focus in host's own tree (its document, or the shadow root
 * the widget renders in). The body, or no active element at all, is nobody holding focus.
 */
export function focusIsOutside(host: HTMLElement): boolean {
  const root = host.getRootNode() as Document | ShadowRoot;
  const active = root.activeElement;
  return !!active && active !== host.ownerDocument.body && !host.contains(active);
}
