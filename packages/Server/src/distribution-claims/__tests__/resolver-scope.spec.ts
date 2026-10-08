/**
 * The resolver's own guard: an API key's scopes. MJ applies key scopes only where a resolver asks
 * (`ResolverBase.CheckAPIKeyScopeAuthorization`); the slug read goes through the provider directly,
 * which never consults them, so without this call a key refused `view:run` on Form Distributions
 * by MJ's generic view path could still read a form's slugs here (#297 review, F1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// type-graphql's decorators need reflect-metadata, which only the running server loads.
vi.mock('type-graphql', () => {
  const noop = () => () => undefined;
  return { Arg: noop, Ctx: noop, Query: noop, Resolver: noop, Field: noop, ObjectType: noop };
});

const scopeCheck = vi.fn<(scopePath: string, resource: string, userPayload: unknown) => Promise<void>>();
const runView = vi.fn(async () => ({ Success: true, Results: [], ErrorMessage: '' }));
const provider = {
  RunView: runView,
  EntityByName: () => ({ GetUserPermisions: () => ({ CanUpdate: true }) }),
};

vi.mock('@memberjunction/server', () => ({
  GetReadOnlyProvider: () => provider,
  ResolverBase: class {
    CheckAPIKeyScopeAuthorization(scopePath: string, resource: string, userPayload: unknown): Promise<void> {
      return scopeCheck(scopePath, resource, userPayload);
    }
    GetUserFromPayload(): { ID: string } {
      return { ID: 'u1' };
    }
  },
}));

const { DistributionClaimsResolver } = await import('../DistributionClaimsResolver');
const FORM = '11111111-1111-4111-8111-111111111111';
type Ctx = Parameters<InstanceType<typeof DistributionClaimsResolver>['FormDistributionClaims']>[1];
const ctx = { providers: [], userPayload: { apiKeyHash: 'h' } } as unknown as Ctx;

beforeEach(() => {
  scopeCheck.mockReset();
  runView.mockClear();
});

describe('FormDistributionClaims API-key scope', () => {
  it("checks the key's view:run scope on Form Distributions, with the caller's payload", async () => {
    scopeCheck.mockResolvedValue(undefined);
    await new DistributionClaimsResolver().FormDistributionClaims(FORM, ctx);
    expect(scopeCheck).toHaveBeenCalledWith('view:run', 'MJ_BizApps_Forms: Form Distributions', ctx.userPayload);
  });

  it('refuses before reading any slug when the key lacks the scope', async () => {
    scopeCheck.mockRejectedValue(new Error("Access denied. This API key requires the 'view:run' scope"));
    await expect(new DistributionClaimsResolver().FormDistributionClaims(FORM, ctx)).rejects.toThrow(/view:run/);
    expect(runView).not.toHaveBeenCalled();
  });
});
