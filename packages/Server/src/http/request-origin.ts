import type { Request } from 'express';

/**
 * The origin (`scheme://host[:port]`) this request arrived on, or `undefined` when it carried no
 * host. A pure read of the request.
 *
 * Used where Forms has to hand a browser an absolute URL back to this API and no public URL has
 * been configured: the process that answered the request is the one serving the URL, so the
 * origin the request reached is the right fallback.
 */
export function getRequestOrigin(req: Request): string | undefined {
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : undefined;
}
