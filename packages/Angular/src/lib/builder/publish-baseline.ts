/**
 * The two reads behind the builder's "is there anything to publish?" answer.
 *
 * Publishing itself is `Forms.PublishForm` now: the server reads the live rows, builds the snapshot
 * and writes the version, so nothing here writes. What the builder still needs is to COMPARE —
 * the draft it holds against the snapshot serving the public link (`publish-fingerprint.ts`) — and
 * for that it needs the form's authored automations as a snapshot would carry them, and the live
 * snapshot itself. Both are plain reads, and both distinguish "none" from "could not read",
 * because the comparison has to fail in the direction that keeps the Publish control available.
 *
 * Each takes the `RunView` it reads through, so a spec can hand it a fake.
 */
import { LogError, type RunView } from '@memberjunction/core';
import {
  AUTHORED_AUTOMATION_FIELDS,
  AUTHORED_BINDING_FIELDS,
  quoteSqlString,
  tryBuildPublishedAutomations,
  type AuthoredAutomationRow,
  type AuthoredBindingRow,
  type PublishedFormAutomation,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';

/**
 * The form's authored automations, shaped as the published snapshot carries them — or null when
 * they could not be read.
 *
 * Automations are part of the snapshot, so they are part of the draft the fingerprint compares;
 * the contracts' `tryBuildPublishedAutomations` is the builder `Forms.PublishForm` runs too, so the
 * two cannot disagree about what a step looks like once published.
 *
 * Null and empty are different answers. Empty means "this form configures no automations", a
 * normal state that keeps it on the legacy hooks. Null means we do not know — a failed read, or a
 * row the strict parser cannot read — and the builder must then treat the draft as unknown rather
 * than as matching what is live.
 */
export async function readDraftAutomations(
  rv: Pick<RunView, 'RunViews'>,
  formId: string,
): Promise<PublishedFormAutomation[] | null> {
  const [automations, bindings] = await rv.RunViews([
    {
      EntityName: FORMS_ENTITY.FormAutomation,
      ExtraFilter: `FormID=${quoteSqlString(formId)}`,
      OrderBy: 'DisplayOrder ASC',
      Fields: [...AUTHORED_AUTOMATION_FIELDS],
      ResultType: 'simple',
    },
    // The bindings ride in the snapshot beside the automations that run them (#303), so the draft
    // has to carry them too or every form with a binding step would read as changed.
    {
      EntityName: FORMS_ENTITY.FormEntityBinding,
      ExtraFilter: `FormID=${quoteSqlString(formId)}`,
      Fields: [...AUTHORED_BINDING_FIELDS],
      ResultType: 'simple',
    },
  ]);
  if (!automations?.Success || !bindings?.Success) {
    LogError(
      `Forms builder: could not read the automations of form ${formId}: ` +
        `${automations?.ErrorMessage || bindings?.ErrorMessage || 'no result'}`,
    );
    return null;
  }
  const built = tryBuildPublishedAutomations(
    (automations.Results ?? []) as AuthoredAutomationRow[],
    (bindings.Results ?? []) as AuthoredBindingRow[],
  );
  if (!built.ok) {
    LogError(`Forms builder: the automations of form ${formId} cannot be read: ${built.error.message}`);
    return null;
  }
  return built.automations;
}

/**
 * The snapshot serving the public link right now, or null when there is not one to read.
 *
 * Null does NOT mean "nothing is published": it covers a form never published AND a failed read,
 * and the caller cannot tell them apart. Treating null as "up to date" is what once made the
 * builder show a static "Published" badge over a draft full of unpublished edits;
 * `publishControlState` handles it, and anything else consuming this must fail the same way.
 */
export async function readLiveSnapshot(rv: Pick<RunView, 'RunView'>, formId: string): Promise<string | null> {
  const result = await rv.RunView<{ DefinitionSnapshot: string | null }>({
    EntityName: FORMS_ENTITY.FormVersion,
    ExtraFilter: `FormID=${quoteSqlString(formId)} AND Status='Published'`,
    OrderBy: 'VersionNumber DESC',
    Fields: ['DefinitionSnapshot'],
    MaxRows: 1,
    ResultType: 'simple',
  });
  if (!result.Success) {
    LogError(`Forms builder: could not read the published snapshot of form ${formId}: ${result.ErrorMessage}`);
    return null;
  }
  return result.Results?.[0]?.DefinitionSnapshot ?? null;
}
