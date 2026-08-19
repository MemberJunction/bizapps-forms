/**
 * The device widths the Preview can be viewed at.
 *
 * The point is not decoration — it is that the widget's responsive rules are written against its
 * CONTAINER (`@container mjf`), not the viewport, because the widget is an embeddable custom
 * element that routinely runs inside someone else's narrow column. Narrowing the preview stage
 * therefore reproduces exactly what a phone gets, in a desktop browser, without an iframe.
 *
 * Widths are the CSS viewport widths of the reference devices, not their hardware pixels:
 * an iPhone 15 reports 393, an iPad Air 820. Those are the numbers the rules actually see.
 */

/** One selectable preview size. A missing dimension means "whatever the window gives us". */
export interface PreviewDevice {
  id: 'desktop' | 'tablet' | 'mobile';
  label: string;
  /** Font Awesome class for the toolbar icon. */
  icon: string;
  width?: number;
  height?: number;
}

export const PREVIEW_DEVICES: readonly PreviewDevice[] = [
  { id: 'desktop', label: 'Desktop', icon: 'fa-solid fa-display' },
  { id: 'tablet', label: 'Tablet', icon: 'fa-solid fa-tablet-screen-button', width: 820, height: 1180 },
  { id: 'mobile', label: 'Mobile', icon: 'fa-solid fa-mobile-screen-button', width: 393, height: 852 },
];

/**
 * How wide the preview stage should be, given the room actually available.
 *
 * Clamping to `available` is the whole reason this is a function rather than a constant: a
 * tablet frame on a half-width browser window would otherwise run off the side of the dialog,
 * and an author checking their tablet layout would be shown a cropped one instead. Better to
 * narrow the frame and say so than to render a lie at the right nominal width.
 */
export function stageWidth(device: PreviewDevice, available: number): number {
  return device.width === undefined ? available : Math.min(device.width, available);
}

/**
 * How tall the preview stage should be.
 *
 * A phone is not just narrow, it is SHORT — and a frame that grows to fit its contents is the
 * one thing a phone never does. Without this the mobile preview rendered as a single
 * 393-by-2000px ribbon: the correct width, and a shape no device has ever had, which tells an
 * author nothing about what actually falls below the fold. Fixing the height and scrolling
 * inside it is what makes "the fold" exist at all.
 */
export function stageHeight(device: PreviewDevice, available: number): number {
  return device.height === undefined ? available : Math.min(device.height, available);
}
