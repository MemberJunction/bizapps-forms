import { describe, expect, it } from 'vitest';

import { fileIdFromPath } from '../config';

describe('fileIdFromPath', () => {
  it('takes the id from the route', () => {
    expect(fileIdFromPath('/forms/files/abc-123')).toBe('abc-123');
  });

  it('ignores everything that is not this route', () => {
    // The handler runs on every request; anything it does not own must fall straight through.
    for (const other of ['/forms/upload', '/forms/asset/abc', '/forms/files', '/graphql', '/']) {
      expect(fileIdFromPath(other)).toBeUndefined();
    }
  });

  it('refuses a deeper path rather than matching its first segment', () => {
    // `/forms/files/a/b` is not a request for `a`; treating it as one is how a strict-looking
    // route starts matching things nobody intended.
    expect(fileIdFromPath('/forms/files/a/b')).toBeUndefined();
  });

  it('decodes a percent-encoded segment', () => {
    expect(fileIdFromPath('/forms/files/a%2Db')).toBe('a-b');
  });
});
