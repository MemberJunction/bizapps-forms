import { Directive, ElementRef, inject, output } from '@angular/core';

import { rowClickActivates } from './row-activate';

/**
 * Makes a row, card or tile activate on a click anywhere that is not one of its own controls.
 *
 * Use: `<article (mjfRowActivate)="open(row)">`, with ONE real `<button>` or `<a>` inside that runs
 * the same handler. That control is the row's keyboard path; this directive adds no `tabindex`,
 * `role` or key handler to the host, so the row is never a button that contains buttons (UI audit
 * F05) and no inner control has to stop the row's events. The pure decision — not inside a
 * control, not the end of a text selection, not the click a drag leaves behind — lives in
 * `rowClickActivates`, where it is tested.
 */
@Directive({
  selector: '[mjfRowActivate]',
  standalone: true,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(click)': 'onClick($event)',
  },
})
export class RowActivateDirective {
  public readonly mjfRowActivate = output<MouseEvent>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pressedAt: { x: number; y: number } | null = null;

  protected onPointerDown(event: PointerEvent): void {
    this.pressedAt = { x: event.clientX, y: event.clientY };
  }

  protected onClick(event: MouseEvent): void {
    const host = this.host.nativeElement;
    const pressed = this.pressedAt;
    this.pressedAt = null;
    const travel = pressed ? Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) : 0;
    const selection = host.ownerDocument.getSelection();
    const selecting = !!selection && !selection.isCollapsed && !!selection.anchorNode && host.contains(selection.anchorNode);
    // Narrowed by shape, not `instanceof Element`: a click's target is always an element here, and
    // the check then holds outside a browser realm too (the spec drives this with plain objects).
    const target = event.target && 'tagName' in event.target ? (event.target as Element) : null;
    if (
      rowClickActivates({
        target,
        host,
        selectionInsideHost: selecting,
        pointerTravelPx: travel,
      })
    ) {
      this.mjfRowActivate.emit(event);
    }
  }
}
