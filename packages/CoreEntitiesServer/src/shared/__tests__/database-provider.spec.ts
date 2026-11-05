import { describe, expect, it } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { requireDatabaseProvider } from '../database-provider.js';
import { makeFakeProvider } from '../../testing/index.js';

describe('requireDatabaseProvider', () => {
  it('passes a server provider through, typed as one', () => {
    const { provider } = makeFakeProvider({});
    expect(requireDatabaseProvider(provider, 'Forms.PublishForm')).toBe(provider);
  });

  it('refuses a client-side provider, naming the caller — it has no SQL and no transactions', () => {
    const client = { EntityByName: () => undefined, RunViews: async () => [] } as unknown as IMetadataProvider;
    expect(() => requireDatabaseProvider(client, 'Forms: Generate Form From Brief')).toThrow(
      /Forms: Generate Form From Brief needs a server database provider/,
    );
  });

  it('refuses a missing provider', () => {
    expect(() => requireDatabaseProvider(undefined, 'Forms.PublishForm')).toThrow(/no provider was given/);
  });
});
