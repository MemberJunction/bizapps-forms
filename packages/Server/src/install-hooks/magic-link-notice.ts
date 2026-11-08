/**
 * Open App lifecycle hook (`mj-app.json` → `hooks.postInstallModule` / `postUpgradeModule`): tells
 * the operator, at install time, when the host's core `magicLink` config will make every public
 * Forms link answer 409.
 *
 * Why it exists: `mj app install` wires schema, migrations and packages, but `magicLink` lives in the
 * host's own server config, which the installer never writes. The 6.2 install rehearsal needed that
 * step on every host, and until now the only signal was a line in MJAPI's startup log, after the
 * install had already reported success.
 *
 * It only prints. It never edits host config and never throws: the engine runs it in-process, and a
 * throw would fail the install's Hooks phase over a setting the operator can fix in a minute.
 *
 * The engine imports this file by its built path from the installed `@mj-biz-apps/forms-server`
 * package, and loads nothing else from it, so it must stay free of the server's heavy imports.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { checkRespondentReadiness, RESPONDENT_ROLE, type HostMagicLinkConfig } from '../respondent-host/host-readiness.js';

/** The part of the engine's `AppHookPayload` this hook reads. Declared structurally so the server
 * package takes no dependency on `@memberjunction/open-app-engine` for one interface. */
export interface MagicLinkHookPayload {
  RepoRoot: string;
  Callbacks?: { OnWarn?: (phase: string, message: string) => void };
}

/** What reading the host config produced: its `magicLink` block, or why it could not be read. */
export type LoadedHostConfig =
  | { ok: true; magicLink: HostMagicLinkConfig | undefined }
  | { ok: false; reason: string };

/** Where an MJ host keeps the config MJAPI reads, most specific first. A 6.2 distribution host's
 * `apps/MJAPI/mj.config.cjs` forwards to the root one. */
const CONFIG_CANDIDATES = [path.join('apps', 'MJAPI', 'mj.config.cjs'), 'mj.config.cjs'];

const CONFIG_BLOCK = [
  '  magicLink: {',
  '    enabled: true,',
  `    restrictedRoleName: '${RESPONDENT_ROLE}',`,
  `    grantableRoleNames: ['${RESPONDENT_ROLE}'],`,
  "    contextUserForProvisioning: 'System',",
  '  },',
].join('\n');

/**
 * The message to show the operator, or `null` when the host is ready. Pure, so each case is testable.
 */
export function buildMagicLinkNotice(loaded: LoadedHostConfig): string | null {
  const header = '[MJ Forms] Public form links need core magicLink on this host.';
  const fix = `Add this to the host's mj.config.cjs, then restart MJAPI (see the MJ Forms README, "Install into a host app"):\n${CONFIG_BLOCK}`;
  // `in` narrows these unions without strictNullChecks, which this package does not enable.
  if ('reason' in loaded) {
    return `${header} The installer could not check this host's config (${loaded.reason}). If magicLink.enabled = true is not already set, every public link will answer 409.\n${fix}`;
  }
  const readiness = checkRespondentReadiness(loaded.magicLink);
  if (!('reason' in readiness)) return null;
  return `${header} ${readiness.reason}\n${fix}`;
}

/** Reads the host's `magicLink` block. Never throws: a config that cannot be loaded is a result. */
export function loadHostMagicLinkConfig(repoRoot: string): LoadedHostConfig {
  const file = CONFIG_CANDIDATES.map((rel) => path.join(repoRoot, rel)).find((p) => existsSync(p));
  if (!file) {
    return { ok: false, reason: `no mj.config.cjs found under ${repoRoot}` };
  }
  try {
    const config = createRequire(import.meta.url)(file) as { magicLink?: HostMagicLinkConfig } | undefined;
    return { ok: true, magicLink: config?.magicLink };
  } catch (e) {
    return { ok: false, reason: `loading ${file} failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** The hook the Open App engine awaits after install and after upgrade. */
export default async function magicLinkNotice(payload: MagicLinkHookPayload): Promise<void> {
  try {
    const notice = buildMagicLinkNotice(loadHostMagicLinkConfig(payload.RepoRoot));
    if (!notice) return;
    if (payload.Callbacks?.OnWarn) payload.Callbacks.OnWarn('Hooks', notice);
    else console.warn(notice);
  } catch (e) {
    // Never fail the install over an advisory check; say what happened instead.
    console.warn(`[MJ Forms] magicLink install check failed for ${payload.RepoRoot}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
