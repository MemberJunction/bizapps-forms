/**
 * The binding allowlist's deployment defaults: unset stays unrestricted (announced at error
 * level, once), an explicitly empty value permits nothing, and the opt-in
 * `FORMS_BINDING_REQUIRE_ALLOWLIST=true` makes an unset list fail CLOSED.
 *
 * `LogError` is captured with `vi.mock` + `vi.hoisted` rather than `vi.spyOn`, for the reason
 * default-salt-warning.spec.ts documents (frozen ESM namespace on a clean install).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: logError,
}));

import { allowedBindingEntities, resetBindingAllowlistNoticeForTests } from '../allowed-entities.js';

beforeEach(() => {
  resetBindingAllowlistNoticeForTests();
  logError.mockClear();
});

afterEach(() => {
  resetBindingAllowlistNoticeForTests();
});

/** Only this module's notices; other LogError traffic must not make a count pass. */
function allowlistNotices(): string[] {
  return logError.mock.calls
    .map((c) => String(c[0]))
    .filter((line) => line.includes('FORMS_BINDING_ALLOWED_ENTITIES'));
}

describe('allowedBindingEntities', () => {
  it('parses a configured list into a set of trimmed names', () => {
    const set = allowedBindingEntities(' People , Organizations ', undefined);
    expect(set).not.toBeNull();
    expect([...(set ?? [])]).toEqual(['People', 'Organizations']);
    expect(allowlistNotices()).toHaveLength(0);
  });

  it('reads a set-but-empty value as "permit nothing", not "permit everything"', () => {
    const set = allowedBindingEntities('  ', undefined);
    expect(set).not.toBeNull();
    expect(set?.size).toBe(0);
  });

  it('stays unrestricted when unset, but says so at error level — once per process', () => {
    expect(allowedBindingEntities(undefined, undefined)).toBeNull();
    expect(allowedBindingEntities(undefined, undefined)).toBeNull();

    expect(allowlistNotices()).toHaveLength(1);
    expect(allowlistNotices()[0]).toMatch(/UNRESTRICTED/);
    expect(allowlistNotices()[0]).toContain('FORMS_BINDING_REQUIRE_ALLOWLIST');
  });

  it('fails CLOSED when unset under FORMS_BINDING_REQUIRE_ALLOWLIST=true, and says so', () => {
    const set = allowedBindingEntities(undefined, 'true');
    expect(set).not.toBeNull();
    expect(set?.size).toBe(0);

    expect(allowlistNotices()).toHaveLength(1);
    expect(allowlistNotices()[0]).toMatch(/DISABLED/);
  });

  it('a configured list wins regardless of the require flag', () => {
    const set = allowedBindingEntities('People', 'true');
    expect([...(set ?? [])]).toEqual(['People']);
    expect(allowlistNotices()).toHaveLength(0);
  });
});
