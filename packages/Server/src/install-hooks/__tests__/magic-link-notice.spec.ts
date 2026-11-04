import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import magicLinkNotice, { buildMagicLinkNotice } from '../magic-link-notice.js';

describe('buildMagicLinkNotice', () => {
  it('stays silent when magicLink is enabled and the respondent role is grantable', () => {
    expect(
      buildMagicLinkNotice({ ok: true, magicLink: { enabled: true, restrictedRoleName: 'Form Respondent' } }),
    ).toBeNull();
  });

  it('tells the operator to enable magicLink, with the config block to paste, when it is missing', () => {
    const notice = buildMagicLinkNotice({ ok: true, magicLink: undefined });
    expect(notice).toContain('magicLink.enabled = true');
    expect(notice).toContain("restrictedRoleName: 'Form Respondent'");
    expect(notice).toContain("grantableRoleNames: ['Form Respondent']");
    expect(notice).toContain("contextUserForProvisioning: 'System'");
  });

  it('names grantableRoleNames when magicLink is on but the respondent role is not grantable', () => {
    const notice = buildMagicLinkNotice({
      ok: true,
      magicLink: { enabled: true, restrictedRoleName: 'Magic Link Baseline' },
    });
    expect(notice).toContain('grantableRoleNames');
  });

  it('still gives the instruction, and says it could not check, when the host config cannot be read', () => {
    const notice = buildMagicLinkNotice({ ok: false, reason: 'Cannot find module mj.config.cjs' });
    expect(notice).toContain('could not check');
    expect(notice).toContain('Cannot find module mj.config.cjs');
    expect(notice).toContain('enabled: true');
  });
});

describe('magicLinkNotice (install / upgrade hook)', () => {
  const roots: string[] = [];
  const makeHost = (rootConfig: string | null, mjapiConfig: string | null): string => {
    const root = mkdtempSync(path.join(tmpdir(), 'forms-hook-'));
    roots.push(root);
    if (rootConfig !== null) writeFileSync(path.join(root, 'mj.config.cjs'), rootConfig);
    if (mjapiConfig !== null) {
      mkdirSync(path.join(root, 'apps', 'MJAPI'), { recursive: true });
      writeFileSync(path.join(root, 'apps', 'MJAPI', 'mj.config.cjs'), mjapiConfig);
    }
    return root;
  };
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('warns once through the installer callback when the host has magicLink off', async () => {
    const OnWarn = vi.fn();
    const root = makeHost('module.exports = { magicLink: { enabled: false } };', null);
    await magicLinkNotice({ RepoRoot: root, Callbacks: { OnWarn } });
    expect(OnWarn).toHaveBeenCalledTimes(1);
    expect(OnWarn.mock.calls[0][0]).toBe('Hooks');
    expect(OnWarn.mock.calls[0][1]).toContain('magicLink.enabled = true');
  });

  it('reads the MJAPI config a distribution host forwards to the root config', async () => {
    const OnWarn = vi.fn();
    const root = makeHost(
      "module.exports = { magicLink: { enabled: true, restrictedRoleName: 'Form Respondent' } };",
      "module.exports = require('../../mj.config.cjs');",
    );
    await magicLinkNotice({ RepoRoot: root, Callbacks: { OnWarn } });
    expect(OnWarn).not.toHaveBeenCalled();
  });

  it('never fails the install when the host config throws on load', async () => {
    const OnWarn = vi.fn();
    const root = makeHost("throw new Error('boom from host config');", null);
    await expect(magicLinkNotice({ RepoRoot: root, Callbacks: { OnWarn } })).resolves.toBeUndefined();
    expect(OnWarn.mock.calls[0][1]).toContain('could not check');
    expect(OnWarn.mock.calls[0][1]).toContain('boom from host config');
  });

  it('falls back to console.warn when the installer passes no callbacks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = makeHost(null, null);
    await magicLinkNotice({ RepoRoot: root });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('could not check');
  });
});
