/**
 * The wire shape every share-link verb returns (`FormsDistributionLinkOutput`), from the engine's
 * result — one mapping for the four verbs, so they cannot drift apart.
 */
import type { FormsDistributionLinkOutput } from '@mj-biz-apps/forms-entities';
import type { DistributionLink } from '../engines/FormDistributionEngine.js';

export function toDistributionLinkOutput(link: DistributionLink): FormsDistributionLinkOutput {
  return {
    FormDistributionID: link.distributionId,
    Slug: link.slug,
    Status: link.status,
    RespondentURL: link.respondentUrl,
  };
}
