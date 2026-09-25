import type { Request } from 'express';

/**
 * The origin (`scheme://host[:port]`) this request arrived on, or `undefined` when it carried no
 * host. A pure read of the request.
 *
 * Used where Forms has to hand a browser an absolute URL back to this API and no public URL has
 * been configured: the process that answered the request is the one serving the URL, so the
 * origin the request reached is the right fallback.
 *
 * Express 5's `req.host` and `req.protocol`, not the raw `Host` header: under `trust proxy` (which
 * Forms sets for the whole app) they honour `X-Forwarded-Host` / `X-Forwarded-Proto`, which is
 * the origin the BROWSER used. The raw header behind a TLS-terminating proxy names the upstream,
 * an address the browser cannot reach. Without a trusted proxy both ignore the forwarded headers,
 * so a caller cannot choose the answer. `req.host` keeps the port.
 */
export function getRequestOrigin(req: Request): string | undefined {
  const host = req.host;
  return host ? `${req.protocol}://${host}` : undefined;
}
