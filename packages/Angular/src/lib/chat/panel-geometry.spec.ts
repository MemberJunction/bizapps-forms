/**
 * The assistant panel's placement, at the sizes the three real surfaces actually have.
 *
 * Each surface is described by the pane it opens in, because that is the input that decides
 * everything: the Design rail is 380px of controls beside a live preview, the Build canvas is a
 * wide column, and the forms list is most of the window. The cases that matter are the extremes —
 * a pane narrower than a readable panel, a pill scrolled to the top of its pane, a pane shorter
 * than the panel's own minimum — because those are the ones a browser will not warn you about and
 * a screenshot only catches if you happen to reproduce them.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_HEIGHT_SHARE,
  PANEL_GUTTER,
  PANEL_MAX_WIDTH,
  panelGeometry,
  type AnchorBox,
  type PanelArea,
} from './panel-geometry';

/** The Design tab's rail: 380px wide, full height beside the preview. */
const RAIL: PanelArea = { left: 24, top: 180, right: 404, bottom: 1000 };
/** The Build tab's canvas column in a wide window. */
const CANVAS: PanelArea = { left: 240, top: 180, right: 1660, bottom: 1000 };
/** The forms list: the dashboard's own scrolling host, nearly the whole window. */
const PAGE: PanelArea = { left: 0, top: 100, right: 1990, bottom: 1040 };

/** A pill sitting at the foot of `area`, as all three hosts place it. */
function pillAtFootOf(area: PanelArea, inset = 14): AnchorBox {
  return { left: area.left + inset, width: area.right - area.left - inset * 2, bottom: area.bottom - inset };
}

const VIEW_HEIGHT = 1080;

describe('panelGeometry', () => {
  it('keeps the panel inside a narrow Design rail instead of spilling over the preview', () => {
    const at = panelGeometry(pillAtFootOf(RAIL), RAIL, VIEW_HEIGHT, false);

    // The bug this replaced: 1040px wide out of a 380px rail, straight across the preview.
    expect(at.left).toBeGreaterThanOrEqual(RAIL.left);
    expect(at.left + at.width).toBeLessThanOrEqual(RAIL.right);
    // And it uses the rail rather than shrinking to a tooltip in the middle of it.
    expect(at.width).toBeGreaterThan(RAIL.right - RAIL.left - PANEL_GUTTER * 2 - 1);
  });

  it('never reaches above the top of its pane, even with the pill scrolled up to it', () => {
    const scrolledUp: AnchorBox = { left: RAIL.left + 14, width: 340, bottom: RAIL.top + 4 };

    const at = panelGeometry(scrolledUp, RAIL, VIEW_HEIGHT, false);

    const topEdge = VIEW_HEIGHT - at.bottom - at.maxHeight;
    expect(topEdge).toBeGreaterThanOrEqual(RAIL.top);
    // A sliver is the other failure: the panel is pushed down enough to still be readable.
    expect(at.maxHeight).toBeGreaterThanOrEqual(200);
  });

  it('stays within the pane vertically at both edges', () => {
    const at = panelGeometry(pillAtFootOf(RAIL), RAIL, VIEW_HEIGHT, false);

    const bottomEdge = VIEW_HEIGHT - at.bottom;
    expect(bottomEdge).toBeLessThanOrEqual(RAIL.bottom);
    expect(VIEW_HEIGHT - at.bottom - at.maxHeight).toBeGreaterThanOrEqual(RAIL.top);
    expect(at.maxHeight).toBeLessThanOrEqual(Math.round((RAIL.bottom - RAIL.top) * MAX_HEIGHT_SHARE));
  });

  it('grows with a wide canvas but stops where a line of chat stops being readable', () => {
    const at = panelGeometry(pillAtFootOf(CANVAS), CANVAS, VIEW_HEIGHT, false);

    expect(at.width).toBeLessThanOrEqual(PANEL_MAX_WIDTH);
    expect(at.left).toBeGreaterThanOrEqual(CANVAS.left);
    expect(at.left + at.width).toBeLessThanOrEqual(CANVAS.right);
  });

  it('opens wide on the forms list, where the pane is the page', () => {
    const pill: AnchorBox = { left: 635, width: 720, bottom: PAGE.bottom - 20 };

    const at = panelGeometry(pill, PAGE, VIEW_HEIGHT, false);

    // Wider than the 720px pill it grew from — that width is a floor, not the answer — and the
    // pane's share (1990 * 0.52) lands just under the readable cap rather than at it.
    expect(at.width).toBeGreaterThan(pill.width);
    expect(at.width).toBeLessThanOrEqual(PANEL_MAX_WIDTH);
    expect(at.width).toBeGreaterThan(1000);
    // Centred on the pill, to within the rounding that turns the numbers into whole pixels.
    expect(Math.abs(at.left + at.width / 2 - (pill.left + pill.width / 2))).toBeLessThanOrEqual(1);
  });

  it('fits a pane shorter than the panel it would like to be', () => {
    const squat: PanelArea = { left: 24, top: 700, right: 404, bottom: 1000 };

    const at = panelGeometry(pillAtFootOf(squat), squat, VIEW_HEIGHT, false);

    expect(VIEW_HEIGHT - at.bottom - at.maxHeight).toBeGreaterThanOrEqual(squat.top);
    // minHeight can never exceed maxHeight, or the panel collapses to nothing.
    expect(at.minHeight).toBeLessThanOrEqual(at.maxHeight);
  });

  it('is a full-width sheet on a phone', () => {
    const phoneArea: PanelArea = { left: 0, top: 0, right: 390, bottom: 760 };
    const pill: AnchorBox = { left: 16, width: 358, bottom: 740 };

    const at = panelGeometry(pill, phoneArea, 760, true);

    expect(at.left).toBe(PANEL_GUTTER);
    expect(at.width).toBe(390 - PANEL_GUTTER * 2);
  });

  it('produces no negative or zero-sized box even in a pane smaller than a panel', () => {
    const tiny: PanelArea = { left: 100, top: 500, right: 220, bottom: 600 };

    const at = panelGeometry({ left: 104, width: 112, bottom: 596 }, tiny, VIEW_HEIGHT, false);

    expect(at.width).toBeGreaterThan(0);
    expect(at.minHeight).toBeGreaterThan(0);
    expect(at.maxHeight).toBeGreaterThanOrEqual(at.minHeight);
  });
});
