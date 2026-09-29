/**
 * Keeping `<mj-form>` in the page while it rebuilds itself.
 *
 * Destroying an Angular component whose host is an existing element detaches that host from the
 * DOM: `ViewRef.destroy()` on a view attached to an `ApplicationRef` runs `detachViewFromDOM`, and
 * the root view's node IS the host. That is harmless when the page removed the element (it is gone
 * already), and exactly wrong when the element tears its own application down to rebuild it: the
 * element removes itself and the form disappears from the page.
 */

/** The slice of a DOM node {@link keepInPlace} uses; a real `Element` satisfies it. */
export interface KeptNode {
  readonly isConnected: boolean;
  readonly parentNode: { insertBefore(node: KeptNode, child: KeptNode | null): unknown } | null;
  readonly nextSibling: KeptNode | null;
}

/**
 * Run `work`, and if it detached `node` from the page, put `node` back where it was — also when
 * `work` throws. A node that was not connected to begin with is left alone.
 */
export function keepInPlace(node: KeptNode, work: () => void): void {
  const parent = node.parentNode;
  const next = node.nextSibling;
  try {
    work();
  } finally {
    if (parent && !node.isConnected) {
      parent.insertBefore(node, next);
    }
  }
}
