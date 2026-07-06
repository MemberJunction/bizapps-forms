import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateClientResponseId } from './client-id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateClientResponseId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a canonical v4 UUID and a fresh value each call', () => {
    const a = generateClientResponseId();
    const b = generateClientResponseId();
    expect(a).toMatch(UUID_RE);
    expect(b).toMatch(UUID_RE);
    expect(a).not.toBe(b);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
        return arr;
      },
    });
    const id = generateClientResponseId();
    expect(id).toMatch(UUID_RE);
  });

  it('falls back to Math.random when Web Crypto is entirely absent', () => {
    vi.stubGlobal('crypto', undefined);
    const id = generateClientResponseId();
    expect(id).toMatch(UUID_RE);
  });
});
