/**
 * The boot WIRING of the automation readiness report (#239): `ConfigureExpressApp` resolves the
 * automation principal, asks core's own `GetUserPermisions` for each entity the shipped hooks need,
 * and logs every gap under one grep-able prefix — without ever throwing out of boot.
 *
 * The verdict itself is covered by `automation/__tests__/automation-readiness.spec.ts`; this pins
 * that the report actually runs at startup and is fed by core's permission computation, which a
 * test of the pure function cannot see.
 *
 * `LogError` is captured with `vi.mock` + `vi.hoisted`, not `vi.spyOn` — see `redeem.service.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const { logError, entityByName, PRINCIPAL } = vi.hoisted(() => ({
  logError: vi.fn(),
  entityByName: vi.fn(),
  PRINCIPAL: { ID: 'automation-user-id', Name: 'Forms Automation Service', IsActive: true },
}));

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {},
  configInfo: { magicLink: { enabled: true, grantableRoleNames: ['Form Respondent'] } },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: {
    Users: [PRINCIPAL],
    Instance: { GetSystemUser: () => ({ ID: 'system-user-id' }), UserByName: () => undefined },
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    EntityByName(name: string): unknown {
      return entityByName(name);
    }
  }
  return { ...actual, Metadata, LogStatus: () => undefined, LogError: logError };
});

vi.mock('../captcha-demand', () => ({ readCaptchaDemand: async () => ({ ok: true, demand: undefined }) }));
vi.mock('../host-readiness', () => ({ assessRespondentReadiness: () => [] }));

import express from 'express';
import { RespondentHostMiddleware } from '../RespondentHostMiddleware';

const TASK_TYPES = 'MJ_BizApps_Tasks: Task Types';

/** Every entity present, the principal holding everything — except Task Types, which it cannot read. */
function hostMissingTaskTypeRead(): void {
  entityByName.mockImplementation((name: string) => ({
    GetUserPermisions: (user: UserInfo) => {
      expect(user.ID).toBe(PRINCIPAL.ID);
      const all = name !== TASK_TYPES;
      return { CanRead: all, CanCreate: true, CanUpdate: true, CanDelete: false };
    },
  }));
}

function automationReadinessLogs(): string[] {
  return logError.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => line.includes('automation'));
}

beforeEach(() => {
  logError.mockReset();
  entityByName.mockReset();
});

describe('RespondentHostMiddleware boot — automation readiness', () => {
  it("logs the principal's missing grant at boot, computed with core's GetUserPermisions", async () => {
    hostMissingTaskTypeRead();

    await new RespondentHostMiddleware().ConfigureExpressApp(express());

    const lines = automationReadinessLogs();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[Forms] On-submit automations are NOT ready:');
    expect(lines[0]).toContain(`lacks Read on '${TASK_TYPES}'`);
  });

  it('never throws out of boot: a failing check is logged with what it was doing', async () => {
    entityByName.mockImplementation(() => {
      throw new Error('metadata not loaded');
    });

    await expect(new RespondentHostMiddleware().ConfigureExpressApp(express())).resolves.toBeUndefined();

    const lines = automationReadinessLogs();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Could not check the on-submit automation principal's grants at boot");
    expect(lines[0]).toContain('metadata not loaded');
  });
});
