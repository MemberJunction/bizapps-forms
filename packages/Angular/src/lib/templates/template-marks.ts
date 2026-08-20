/**
 * The icon and colour a saved template wears in the gallery.
 *
 * WHY IT IS DERIVED AND NOT STORED. A saved template has no icon column and does not need one:
 * the mark is computed from the template's own id, so it is stable for the life of that template
 * without a byte of storage, and no migration is needed to give templates a face. A genuinely
 * random pick would have to be persisted or the icon would change on every page load, which reads
 * as a bug — the same card wearing a different face each time you look at it.
 *
 * Across templates the marks still look arbitrary, which is the point: they are recognition
 * handles, not classifications. Nobody should read meaning into "mine is a flask".
 *
 * THE POOL AVOIDS EVERY STARTER ICON. The gallery shows saved templates directly above the
 * built-in starters, and a saved template wearing the envelope of "Contact form" would read as
 * that starter. `template-marks.spec.ts` holds the pool to that, checking against the live
 * catalogue rather than a transcribed list, so adding a starter icon that collides fails the
 * build instead of quietly landing in the UI.
 */
import { VIZ_SERIES_LENGTH, vizSeriesClass } from '../shared/forms-viz';

/**
 * Distinct, recognisable marks, none of them a starter's. Font Awesome 6 **Free** only — a Pro
 * glyph renders as an empty box against the CDN build MJExplorer loads.
 */
export const TEMPLATE_MARK_ICONS: readonly string[] = [
  'fa-solid fa-bookmark',
  'fa-solid fa-star',
  'fa-solid fa-cube',
  'fa-solid fa-compass',
  'fa-solid fa-lightbulb',
  'fa-solid fa-puzzle-piece',
  'fa-solid fa-flask',
  'fa-solid fa-anchor',
];

/** An icon class plus one of the shared `--mjf-viz-*` series colours. */
export interface TemplateMark {
  icon: string;
  colorClass: string;
}

/** The mark for a template id. Pure and total — any string yields a mark. */
export function templateMark(templateId: string): TemplateMark {
  const h = hash(templateId);
  return {
    icon: TEMPLATE_MARK_ICONS[h % TEMPLATE_MARK_ICONS.length],
    // Shifted by one so icon and colour do not advance in lockstep: with the pool and the series
    // both eight long, indexing on the same value would tie every bookmark to the same blue.
    colorClass: vizSeriesClass((h + Math.floor(h / TEMPLATE_MARK_ICONS.length)) % VIZ_SERIES_LENGTH),
  };
}

/** FNV-1a. Chosen for spread over short, near-identical GUID strings, not for cryptography. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
