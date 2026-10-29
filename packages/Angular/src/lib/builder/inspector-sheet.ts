/** The slice of an element the sheet needs: whether it is still on the page, and focus. */
export interface FocusTarget {
  readonly isConnected: boolean;
  focus(): void;
}

/** Below this width the Properties pane is a bottom sheet. Matches the builder's 900px layout break. */
export const SHEET_MEDIA_QUERY = '(max-width: 900px)';

/**
 * Where focus goes when the builder's Properties pane opens and closes as a bottom sheet.
 *
 * Showing and hiding the sheet is CSS: it is visible while something is selected. What CSS cannot
 * do is move focus, which a sheet that covers the canvas has to: into the sheet when it opens, and
 * back to the card that opened it when it closes. At desktop widths the pane is a column beside the
 * canvas and this does nothing.
 */
export class InspectorSheet {
  private returnTo: FocusTarget | null = null;
  private open = false;

  constructor(private readonly isNarrow: () => boolean) {}

  /**
   * A selection opened the pane. Returns true when the caller should move focus into the sheet:
   * on a narrow screen, and only for the selection that opened it, not one made from inside it.
   */
  Opened(activeElement: FocusTarget | null): boolean {
    if (this.open || !this.isNarrow()) return false;
    this.open = true;
    this.returnTo = activeElement;
    return true;
  }

  /** The sheet closed. Returns the element to refocus, or null when there is none to go back to. */
  Closed(): FocusTarget | null {
    const target = this.returnTo;
    this.open = false;
    this.returnTo = null;
    return target?.isConnected ? target : null;
  }
}
