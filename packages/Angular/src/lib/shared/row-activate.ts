/**
 * The slice of an element the row decision reads. A real `Element` satisfies it; specs pass plain
 * objects, since this suite has no DOM.
 */
export interface RowNode {
  tagName: string;
  parentElement: RowNode | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  isContentEditable?: boolean;
}

/** Elements that act on a click themselves. A click that starts in one is that control's, not the row's. */
const CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY', 'OPTION']);
const CONTROL_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'option', 'tab', 'slider', 'textbox']);

/** More pointer travel than this between press and release is a drag, not a click. */
export const DRAG_THRESHOLD_PX = 4;

function isControl(n: RowNode): boolean {
  const tag = n.tagName.toUpperCase();
  if (CONTROL_TAGS.has(tag)) return true;
  if (tag === 'A' && n.hasAttribute('href')) return true;
  if (n.isContentEditable) return true;
  const role = n.getAttribute('role');
  return role !== null && CONTROL_ROLES.has(role);
}

/** Whether `target`, or an ancestor below `host`, is a control. The walk never climbs past the host. */
export function startsInsideControl(target: RowNode | null, host: RowNode): boolean {
  for (let n = target; n && n !== host; n = n.parentElement) {
    if (isControl(n)) return true;
  }
  return false;
}

export interface RowClick {
  target: RowNode | null;
  host: RowNode;
  /** The click ends a text selection inside the row: the reader was copying, not opening. */
  selectionInsideHost: boolean;
  /** Distance the pointer moved between press and release. */
  pointerTravelPx: number;
}

/** Whether a click on a row should activate it. */
export function rowClickActivates(c: RowClick): boolean {
  if (!c.target) return false;
  if (c.selectionInsideHost) return false;
  if (c.pointerTravelPx > DRAG_THRESHOLD_PX) return false;
  return !startsInsideControl(c.target, c.host);
}
