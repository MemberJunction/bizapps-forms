import { describe, expect, it } from 'vitest';
import express, { type Request } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { getRequestOrigin } from '../request-origin';

/** The two facts the helper reads, and nothing else. */
function requestWith(protocol: string, host: string | undefined): Request {
  return { protocol, host } as unknown as Request;
}

/**
 * The origin a real express app computes for one request, under the `trust proxy` setting Forms
 * sets for the whole app. Real express rather than a fake, because what is being pinned is express's
 * own reading of the forwarded headers.
 */
async function originSeenBehind(trustProxy: boolean, headers: Record<string, string>): Promise<string | undefined> {
  const app = express();
  app.set('trust proxy', trustProxy ? 1 : false);
  let seen: string | undefined;
  app.use((req, res) => {
    seen = getRequestOrigin(req);
    res.end();
  });
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolveListening) => server.once('listening', () => resolveListening()));
    const { port } = server.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${port}/`, { headers });
    return seen;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe('getRequestOrigin', () => {
  it('builds the origin from the protocol and the host, port included', () => {
    expect(getRequestOrigin(requestWith('http', 'localhost:4131'))).toBe('http://localhost:4131');
    expect(getRequestOrigin(requestWith('https', 'forms.example.com'))).toBe('https://forms.example.com');
  });

  it('is undefined when the request carried no host', () => {
    expect(getRequestOrigin(requestWith('http', undefined))).toBeUndefined();
  });

  // #238: a browser behind a TLS-terminating proxy reached the PROXY's origin, and that is the
  // origin it must be told to call back. Reading the raw Host header handed it the upstream's.
  it('honours X-Forwarded-Host and X-Forwarded-Proto when the proxy is trusted', async () => {
    const origin = await originSeenBehind(true, {
      'X-Forwarded-Host': 'forms.example.com',
      'X-Forwarded-Proto': 'https',
    });
    expect(origin).toBe('https://forms.example.com');
  });

  it('ignores forwarded headers when no proxy is trusted', async () => {
    const origin = await originSeenBehind(false, { 'X-Forwarded-Host': 'attacker.example' });
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
