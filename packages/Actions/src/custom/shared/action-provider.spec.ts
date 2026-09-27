/**
 * Unit tests for {@link resolveActionProvider} / {@link isActionDataProvider} — the seam every
 * on-submit action's data access now routes through (bizapps-forms#260).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';

const globalState: { provider: IMetadataProvider | null } = { provider: null };
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    static get Provider(): IMetadataProvider | null {
      return globalState.provider;
    }
  }
  return { ...actual, Metadata };
});
const { resolveActionProvider } = await import('./action-provider');

function fakeDataProvider(label: string): IMetadataProvider {
  return { label, RunView: async () => ({}), RunViews: async () => [], GetEntityObject: async () => ({}) } as unknown as IMetadataProvider;
}

describe('resolveActionProvider', () => {
  beforeEach(() => {
    globalState.provider = fakeDataProvider('global');
  });

  it('returns the caller-supplied provider, never the global one', () => {
    const own = fakeDataProvider('own');
    expect(resolveActionProvider({ Provider: own })).toBe(own);
  });

  it('falls back to the process provider when the caller supplies none (direct invocation)', () => {
    expect(resolveActionProvider({})).toBe(globalState.provider);
  });

  it('refuses a supplied provider that cannot run views instead of quietly using the global one', () => {
    const metadataOnly = { GetEntityObject: async () => ({}) } as unknown as IMetadataProvider;
    expect(() => resolveActionProvider({ Provider: metadataOnly })).toThrow(/RunActionParams\.Provider.*RunView/);
  });

  it('fails loudly when there is no process provider at all', () => {
    globalState.provider = null;
    expect(() => resolveActionProvider({})).toThrow(/no metadata provider/i);
  });
});
