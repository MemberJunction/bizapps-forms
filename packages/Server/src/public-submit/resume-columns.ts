/**
 * The three touch-points of the two columns `V202609031200__v0.12.x__Resume_Own_Response.sql` adds,
 * in ONE module, because right now they are the only part of #138 that cannot be written.
 *
 * ⚠️ BLOCKED ON CODEGEN. `FormResponse.FormDistributionID` and `FormDistribution.AllowDeviceResume`
 * exist in that migration and nowhere else: the migration has not been applied to a database, so
 * `npm run mj:codegen` has not regenerated `packages/Entities/src/generated/entity_subclasses.ts`
 * and neither property exists on the entity types. `.claude/rules/typescript-style.md` is explicit
 * about what to do here — *"NEVER write code that depends on fields not yet in generated types …
 * wait for CodeGen"* — and hand-editing the generated file is forbidden by CLAUDE.md. So the rest of
 * the feature is written against types that exist today, and the three lines that cannot be are
 * collected here behind functions whose signatures are already final.
 *
 * EVERY ONE OF THEM FAILS CLOSED. Not because failing closed is neutral — it is not, it disables
 * same-device resume entirely — but because the alternatives are worse in kind rather than degree:
 * defaulting `AllowDeviceResume` to `true` would silently ignore an owner's kiosk switch, and
 * skipping the distribution match with a permissive answer would drop a guard the review added
 * (finding 2). A feature that is off until CodeGen runs is a state an operator can see; a guard that
 * silently passes is not.
 *
 * ── TO UNBLOCK (the whole change is in this file) ────────────────────────────────────────────────
 *   1. `pnpm run mj:migrate` then `pnpm run mj:codegen` (NOT from a worktree while MJ's host is up —
 *      it serves the main checkout off the same shared database; see the repo's own notes).
 *   2. Append CodeGen's output to the migration, as `V202608252340` does.
 *   3. Replace the three bodies below with their one-liners — each is written out above its stub.
 *   4. Delete `resumeColumnsPending()` and its call sites' log line, and this banner.
 *   5. `npm run lint:migrations` goes green (it is red today for exactly these two columns: the
 *      generated stored procedures have no parameter for either, so a save that set them would fail
 *      with "too many arguments specified").
 */
import { LogStatus } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType, mjBizAppsFormsFormResponseEntity } from '@mj-biz-apps/forms-entities';

/**
 * Whether the two columns are still unavailable. Exported so a caller can say so once, out loud,
 * rather than every surface quietly behaving as though the owner had turned resume off.
 */
export function resumeColumnsPending(): boolean {
  return true;
}

/** One line, said once per process, so an operator can tell "switched off" from "not migrated yet". */
let announced = false;
export function announceResumeColumnsPendingOnce(): void {
  if (announced || !resumeColumnsPending()) {
    return;
  }
  announced = true;
  LogStatus(
    '[Forms] Same-device resume is INACTIVE: migration V202609031200 has not been applied and ' +
      'CodeGen has not generated FormResponse.FormDistributionID / FormDistribution.AllowDeviceResume. ' +
      'The emailed resume link is unaffected. See packages/Server/src/public-submit/resume-columns.ts.',
  );
}

/**
 * Stamp the link a response came through, once, when the row is created.
 *
 * Write-once like the owner beside it: the column is the authorization key a resumed session reads
 * its own distribution through, so a later save must never be able to move a row to another link.
 *
 * AFTER CODEGEN:
 *   if (!response.FormDistributionID) {
 *     response.FormDistributionID = distributionId;
 *   }
 */
export function stampFormDistribution(
  response: mjBizAppsFormsFormResponseEntity,
  distributionId: string,
): void {
  void response;
  void distributionId;
  announceResumeColumnsPendingOnce();
}

/**
 * The link's own answer to "may this browser hold a pointer to a draft of mine?".
 *
 * Default is ON in the schema (`DEFAULT (1)`) — a host that wants the feature gets it without
 * touching every link — but until the column exists there is nothing to read, and answering `true`
 * from here would mean an owner who set it to 0 was ignored. So: closed.
 *
 * AFTER CODEGEN:
 *   return distribution.AllowDeviceResume === true;
 */
export function deviceResumeAllowed(
  distribution: Pick<mjBizAppsFormsFormDistributionEntityType, 'ID'>,
): boolean {
  void distribution;
  announceResumeColumnsPendingOnce();
  return false;
}

/**
 * The link a stored response came through, for the `/remember` guard that requires it to match the
 * distribution the caller's JWT is scoped to (review finding 2).
 *
 * `undefined` means "cannot tell". The caller treats that as a REFUSAL, never as a pass — which is
 * why this returning `undefined` today is the same thing as device resume being off.
 *
 * AFTER CODEGEN:
 *   return response.FormDistributionID ?? undefined;
 */
export function distributionOfResponse(
  response: Pick<mjBizAppsFormsFormResponseEntity, 'ID'>,
): string | undefined {
  void response;
  return undefined;
}
