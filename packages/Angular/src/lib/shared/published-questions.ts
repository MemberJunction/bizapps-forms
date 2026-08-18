/**
 * Reading the published snapshot's question list.
 *
 * Answers reference questions by id; every surface that labels an answer needs the
 * questions of the version the answer was submitted against, flattened in page order.
 */
import type {
  PublishedFormDefinition,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';

/** Flattens a definition's pages into questions in page/display order. */
export function flattenQuestions(def: PublishedFormDefinition): PublishedFormQuestion[] {
  const out: PublishedFormQuestion[] = [];
  const pages = [...def.pages].sort((a, b) => a.displayOrder - b.displayOrder);
  for (const p of pages) {
    const qs = [...p.questions].sort((a, b) => a.displayOrder - b.displayOrder);
    out.push(...qs);
  }
  return out;
}
