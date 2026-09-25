import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { getRequestOrigin } from '../request-origin';

/** The two facts the helper reads, and nothing else — `get` answers the `Host` header. */
function requestWith(protocol: string, host: string | undefined): Request {
  return { protocol, get: (name: string) => (name.toLowerCase() === 'host' ? host : undefined) } as unknown as Request;
}

describe('getRequestOrigin', () => {
  it('builds the origin from the protocol and the host, port included', () => {
    expect(getRequestOrigin(requestWith('http', 'localhost:4131'))).toBe('http://localhost:4131');
    expect(getRequestOrigin(requestWith('https', 'forms.example.com'))).toBe('https://forms.example.com');
  });

  it('is undefined when the request carried no host', () => {
    expect(getRequestOrigin(requestWith('http', undefined))).toBeUndefined();
  });
});
