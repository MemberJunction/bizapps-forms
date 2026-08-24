/**
 * Where the form assistant's panel goes, as arithmetic.
 *
 * Split out of the component because it is the part that keeps being wrong. The panel is a
 * popover in the top layer, so nothing in CSS constrains it — every edge is a number computed
 * here, and each of the three bugs this code has had (a panel that left the viewport when its
 * pane scrolled, one that collapsed to a sliver, one that opened 1040px wide out of a 380px
 * rail) was a missing clamp rather than a rendering problem. Numbers in, numbers out: the whole
 * thing is exercised by `panel-geometry.spec.ts` without a DOM, which is the only way to test
 * "what happens when the pill is two pixels from the top of its pane" at all.
 *
 * {@link ownerArea} is the one part that reads the DOM: it finds the pane a pill lives in. It sits
 * here rather than in the component because it answers the same question the arithmetic does — what
 * box is this panel allowed to occupy — and splitting an answer across two files is how the two
 * halves end up disagreeing.
 */

/** A rectangle in viewport coordinates. */
export interface PanelArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What the pill measures to. Its own `DOMRect` satisfies this. */
export interface AnchorBox {
  left: number;
  width: number;
  bottom: number;
}

/** The five values written onto the panel, in CSS pixels. */
export interface PanelGeometry {
  left: number;
  width: number;
  /** Distance from the BOTTOM of the viewport — the panel is `position: fixed`. */
  bottom: number;
  minHeight: number;
  maxHeight: number;
}

/** Breathing room kept between the panel and every edge of the pane it opens in. */
export const PANEL_GUTTER = 12;
/** At or below this the panel becomes a full-width sheet. Matches the CSS breakpoint. */
export const PHONE_WIDTH = 640;
/** Narrower than this and a reply with a bullet list stops being readable. */
export const PANEL_MIN_WIDTH = 380;
/**
 * How much of a wide pane the panel takes once the pill has stopped growing.
 *
 * The pill caps at 720px (`.fc { max-width }`), so in a pane much wider than that the anchor
 * stops being a useful measure and this takes over.
 */
export const WIDTH_SHARE = 0.52;
/**
 * The widest a panel gets, whatever the pane offers.
 *
 * Not a layout limit but a reading one: much past this a line of chat is long enough that the eye
 * loses the start of the next one, which is the thing every measure of body text is chosen to
 * avoid. The thread's own content stays comfortable because the panel never exceeds it.
 */
export const PANEL_MAX_WIDTH = 1040;
/** The floor, for a pane too short for a share of it to mean anything. */
export const PANEL_MIN_HEIGHT = 320;
/**
 * The hard floor, below which the panel stops being a panel.
 *
 * Only reached by a pane smaller than a panel — a rail in a short window, a half-collapsed split.
 * It exists so the arithmetic cannot produce a negative width or a zero-height box that the author
 * can neither read nor find the close button in.
 */
export const PANEL_FLOOR = 200;
/** Above this a panel stops reading as a panel and starts reading as a takeover. */
export const MAX_HEIGHT_SHARE = 0.86;
/** On a phone there is nothing behind worth preserving, so the sheet takes most of the screen. */
export const PHONE_HEIGHT_SHARE = 0.76;

/**
 * Place and size the panel inside `area`, over `box`.
 *
 * `area` is the pane that owns the pill — the Design rail, the Build canvas column, the forms
 * list's scrolling host — already clipped to the visible viewport. Everything is measured against
 * it rather than against the window, which is what keeps the panel reading as that pane opening
 * up instead of as a dialog that happens to have been launched from there.
 *
 * `viewHeight` is needed only to convert the panel's bottom edge into the `bottom` offset a
 * fixed-position element wants.
 */
export function panelGeometry(
  box: AnchorBox,
  area: PanelArea,
  viewHeight: number,
  phone: boolean,
): PanelGeometry {
  const areaWidth = area.right - area.left;
  const areaHeight = area.bottom - area.top;

  // --- width: the anchor's, or a share of a wide pane, whichever is more generous -------------
  // The pane's room is the last word, so a rail narrower than PANEL_MIN_WIDTH gets a panel that
  // fits the rail rather than one that reads well and hangs over whatever sits beside it.
  const widthRoom = Math.max(PANEL_FLOOR, areaWidth - PANEL_GUTTER * 2);
  const roomy = Math.max(box.width, areaWidth * WIDTH_SHARE, PANEL_MIN_WIDTH);
  const width = phone ? widthRoom : Math.min(roomy, PANEL_MAX_WIDTH, widthRoom);
  // Centred on the anchor, then pulled back inside the pane if that pushed it out.
  const centred = box.left + box.width / 2 - width / 2;
  const left = Math.max(area.left + PANEL_GUTTER, Math.min(centred, area.right - width - PANEL_GUTTER));

  // --- height: a share of the pane, never taller than the room above the anchor ---------------
  // The pill can be scrolled almost out of its own pane — the capture-phase scroll listener exists
  // precisely because these panes scroll. The panel's bottom edge is pushed DOWN far enough to
  // leave a readable panel above it, then pulled UP to stay inside the pane. Without the first
  // clamp the panel becomes a sliver; without the second it sits off the top of the pane, where
  // the pill is `visibility: hidden` behind it and the author can see neither and has to guess at
  // Escape.
  const topLimit = area.top + PANEL_GUTTER;
  const floor = Math.min(PANEL_MIN_HEIGHT, Math.max(PANEL_FLOOR, areaHeight - PANEL_GUTTER * 2));
  const bottomEdge = Math.min(Math.max(box.bottom, topLimit + floor), area.bottom - PANEL_GUTTER);
  const available = Math.max(PANEL_FLOOR, bottomEdge - topLimit);
  // THE FLOOR IS A FIXED HEIGHT, NOT A SHARE OF THE PANE. It used to be two thirds of the pane,
  // reasoning that a two-turn thread should not render as a box a few lines high. In a tall window
  // that produced the opposite failure and a worse one: on a 1150px-high forms list the panel was
  // forced to 760px, so a two-turn conversation sat at the bottom of an enormous empty slab that
  // read as floating in the middle of the page rather than as attached to the box it grew from.
  //
  // Between this floor and the cap the height is decided by CONTENT — the panel is a flex column
  // and the thread inside it flexes — so a short conversation now gets a compact panel sitting on
  // its own composer, and a long one still grows to most of the pane. A phone keeps its share: a
  // sheet covering the screen is the point there, and there is nothing behind it worth seeing.
  const minHeight = phone
    ? Math.min(Math.max(PANEL_MIN_HEIGHT, areaHeight * PHONE_HEIGHT_SHARE), available)
    : Math.min(PANEL_MIN_HEIGHT, available);
  const maxHeight = Math.min(available, areaHeight * MAX_HEIGHT_SHARE);

  return {
    left: Math.round(left),
    width: Math.round(width),
    bottom: Math.round(viewHeight - bottomEdge),
    minHeight: Math.round(minHeight),
    // Never below the floor: a max under the min would collapse the panel in a very short pane.
    maxHeight: Math.round(Math.max(minHeight, maxHeight)),
  };
}

/**
 * The pane the pill lives in, clipped to the viewport — the box the panel is allowed to fill.
 *
 * "Pane" is read off the DOM rather than passed in: the nearest ancestor that clips or scrolls is
 * exactly the thing an author perceives as the region the pill belongs to. That is `.dp-editor` in
 * the Design rail, the canvas pane in Build, and the dashboard's own scrolling host on the forms
 * list — three different boxes, one rule, and no host has to declare which one it is.
 *
 * Clipped to the viewport because a pane can be scrolled partly off-screen; the panel must be
 * positioned in what is visible of it, not in where the pane would be if you could see all of it.
 * Falling back to the whole viewport is right for a host that clips nothing at all.
 */
export function ownerArea(anchor: HTMLElement, viewWidth: number, viewHeight: number): PanelArea {
  const whole: PanelArea = { left: 0, top: 0, right: viewWidth, bottom: viewHeight };
  const pane = clippingAncestor(anchor);
  if (!pane) {
    return whole;
  }
  const rect = pane.getBoundingClientRect();
  return {
    left: Math.max(whole.left, rect.left),
    top: Math.max(whole.top, rect.top),
    right: Math.min(whole.right, rect.right),
    bottom: Math.min(whole.bottom, rect.bottom),
  };
}

/** The nearest ancestor that scrolls or clips, or null if nothing between here and the body does. */
function clippingAncestor(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (CLIPS.test(style.overflowY) || CLIPS.test(style.overflowX)) {
      return node;
    }
  }
  return null;
}

/** `clip` included: it clips as hard as `hidden` and is what a pane may well be written with. */
const CLIPS = /^(auto|scroll|hidden|clip)$/;
