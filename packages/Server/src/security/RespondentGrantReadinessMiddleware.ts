/**
 * Boot-time re-assertion of the Respondent-grant hardening (#39). Registers no route.
 *
 * The migration `V202608131600__v0.10.x__Respondent_Grant_Hardening.sql` closes the direct-create
 * bypass of the whole submit pipeline (Turnstile, rate limits, quota, validation, open/close
 * window) by giving every `Form Respondent` CanCreate permission row on the two response entities
 * a deny-all Create RLS filter. Its THROW checks run exactly once, at apply time — but MJ's
 * `UserExemptFromRowLevelSecurity` passes on the FIRST permission row whose filter slot is null,
 * and `__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), so a sibling app's
 * later install/uninstall or an operator edit that leaves ONE unfiltered CanCreate row silently
 * re-opens the bypass. This middleware re-runs the two checks at every boot and logs at ERROR —
 * loudly, next to the salt and storage readiness lines — when the invariant no longer holds.
 * It never refuses boot: MJAPI serves other apps too, and the failure mode we are defending
 * against is SILENCE, not availability.
 */
import type { Application } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogError, LogStatus, RunView } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

const RESPONDENT_ROLE = 'Form Respondent';
const RESPONSE_ENTITIES = ['MJ_BizApps_Forms: Form Responses', 'MJ_BizApps_Forms: Form Response Answers'] as const;

interface PermissionRow {
  Entity: string;
  CanCreate: boolean;
  CreateRLSFilterID: string | null;
}

@RegisterClass(BaseServerMiddleware, 'mj:formsRespondentGrantReadiness')
export class RespondentGrantReadinessMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsRespondentGrantReadiness';
  }

  public override get Enabled(): boolean {
    return true;
  }

  public override async ConfigureExpressApp(_app: Application): Promise<void> {
    await this.reportRespondentGrants();
  }

  /** Must never throw out of boot — MJAPI also serves other apps. */
  private async reportRespondentGrants(): Promise<void> {
    try {
      const systemUser = UserCache.Instance.GetSystemUser();
      if (!systemUser) {
        LogError('[Forms] Could not check Form Respondent grants at boot: the user cache has no system user.');
        return;
      }
      const entityList = RESPONSE_ENTITIES.map((name) => `'${name.replace(/'/g, "''")}'`).join(', ');
      const result = await new RunView().RunView<PermissionRow>(
        {
          EntityName: 'MJ: Entity Permissions',
          ExtraFilter: `RoleName = '${RESPONDENT_ROLE}' AND Entity IN (${entityList})`,
          Fields: ['Entity', 'CanCreate', 'CreateRLSFilterID'],
          ResultType: 'simple',
          BypassCache: true,
        },
        systemUser,
      );
      if (!result.Success) {
        LogError(`[Forms] Could not check Form Respondent grants at boot: ${result.ErrorMessage ?? 'permission lookup failed'}`);
        return;
      }
      this.judgeGrantRows(result.Results ?? []);
    } catch (e) {
      LogError(`[Forms] Could not check Form Respondent grants at boot: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The two apply-time THROW checks from the hardening migration, re-run as boot ERRORs. */
  private judgeGrantRows(rows: PermissionRow[]): void {
    for (const entityName of RESPONSE_ENTITIES) {
      const createRows = rows.filter((r) => r.Entity === entityName && r.CanCreate === true);
      const unfiltered = createRows.filter((r) => !r.CreateRLSFilterID);
      if (createRows.length === 0) {
        LogError(
          `[Forms] Respondent grants are NOT ready: '${RESPONDENT_ROLE}' has no CanCreate permission row on ` +
            `'${entityName}', so every public submission will be refused. Re-run the Forms migrations.`,
        );
      } else if (unfiltered.length > 0) {
        LogError(
          `[Forms] SECURITY: '${RESPONDENT_ROLE}' holds ${unfiltered.length} CanCreate permission row(s) on ` +
            `'${entityName}' with NO Create RLS filter. MJ passes RLS on the first unfiltered row, so the ` +
            `anonymous respondent role can create rows through the generic Create mutation, bypassing ` +
            `Turnstile, rate limits, quota, validation and the open/close window. Restore the deny-all ` +
            `filter from V202608131600 (Respondent Grant Hardening) on every such row.`,
        );
      }
    }
    if (rows.length > 0 && rows.every((r) => !r.CanCreate || !!r.CreateRLSFilterID)) {
      LogStatus('[Forms] Respondent create grants verified: every CanCreate row carries its Create RLS filter.');
    }
  }
}
