/**
 * The abuse identity is the one input to the public-submit rate limiter that an attacker must
 * not be able to choose. These tests pin exactly that: which bytes we are willing to derive it
 * from, and under what configuration.
 */
import { describe, expect, it } from 'vitest';
import {
  currentRequestIdentity,
  forwardableAddress,
  hashClientIp,
  resolveClientIp,
  runWithRequestIdentity,
} from '../request-identity';

describe('resolveClientIp', () => {
  it('ignores X-Forwarded-For when no proxy hop is trusted', () => {
    // With nothing in front of the API, XFF is just a header the caller typed. Honouring it
    // would recreate the `x-session-id` rotation bypass under a new name.
    const ip = resolveClientIp(
      { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '203.0.113.7' } },
      0,
    );

    expect(ip).toBe('203.0.113.7');
  });

  it('trusts only the right-most entry a proxy we operate appended', () => {
    // One proxy in front: it appended the peer it saw. Everything to the LEFT of that was
    // supplied by the caller, so `9.9.9.9` here is a forgery attempt, not an origin.
    const ip = resolveClientIp(
      { headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }, socket: { remoteAddress: '10.0.0.1' } },
      1,
    );

    expect(ip).toBe('203.0.113.7');
  });
});

describe('hashClientIp', () => {
  it('treats one IPv6 /64 as one caller', () => {
    // A single host is routinely handed an entire /64, so keying per address would let one
    // machine mint effectively unlimited buckets — the same bypass in a different field.
    expect(hashClientIp('2001:db8:abcd:1234::1')).toBe(hashClientIp('2001:db8:abcd:1234:5678:9abc:def0:1'));
  });

  it('keeps distinct /64s in distinct buckets', () => {
    expect(hashClientIp('2001:db8:abcd:1234::1')).not.toBe(hashClientIp('2001:db8:abcd:9999::1'));
  });

  it('reads an IPv4-mapped peer as the same caller as a bare IPv4 peer', () => {
    // A dual-stack listener reports an IPv4 client as ::ffff:a.b.c.d. Two spellings, one caller.
    expect(hashClientIp('::ffff:203.0.113.7')).toBe(hashClientIp('203.0.113.7'));
  });

  it('ignores a source port, which would otherwise be a fresh bucket per connection', () => {
    // Some proxies write `[v6]:port` / `ipv4:port` into X-Forwarded-For. The port changes on
    // every connection, so keying on it would hand the caller an unlimited supply of buckets —
    // the original bypass, restored by a formatting detail.
    expect(hashClientIp('203.0.113.7:54321')).toBe(hashClientIp('203.0.113.7'));
    expect(hashClientIp('[2001:db8:abcd:1234::1]:54321')).toBe(hashClientIp('2001:db8:abcd:1234::1'));
  });

  it('reads every spelling of an IPv4-mapped address as the one caller it is', () => {
    // A proxy may write any of these into X-Forwarded-For. Only the dotted `::ffff:` form was
    // recognised, so the other two fell through to /64 reduction and landed on `::/64` — sharing
    // a bucket with each other AND with unrelated `::` addresses like loopback. That is both
    // halves of the failure at once: one caller split across buckets, and unrelated callers
    // merged into one.
    const dotted = hashClientIp('::ffff:1.2.3.4');
    expect(hashClientIp('0:0:0:0:0:ffff:1.2.3.4')).toBe(dotted);
    expect(hashClientIp('::ffff:0102:0304')).toBe(dotted);
    expect(hashClientIp('1.2.3.4')).toBe(dotted);
    expect(hashClientIp('::1')).not.toBe(dotted);
  });

  it('reads a zero-padded IPv4 address as the same caller as its plain spelling', () => {
    expect(hashClientIp('01.02.03.04')).toBe(hashClientIp('1.2.3.4'));
  });

  it('never leaks the address it hashed', () => {
    expect(hashClientIp('203.0.113.7')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClientIp('203.0.113.7')).not.toContain('203.0.113');
  });
});

describe('runWithRequestIdentity', () => {
  it('keeps each concurrent request on its own identity across awaits', async () => {
    // The resolver reads this many awaits deep, while other requests are in flight. If the
    // carrier were a module-level variable this is precisely where it would cross-talk, and
    // the damage would be silent: one caller's submissions charged to another's bucket.
    const observe = async (settle: number): Promise<string | undefined> => {
      await new Promise((resolve) => setTimeout(resolve, settle));
      return currentRequestIdentity()?.ipHash;
    };

    const [slow, fast] = await Promise.all([
      runWithRequestIdentity({ ip: '203.0.113.20', ipHash: 'hash-slow' }, () => observe(20)),
      runWithRequestIdentity({ ip: '203.0.113.1', ipHash: 'hash-fast' }, () => observe(1)),
    ]);

    expect(slow).toBe('hash-slow');
    expect(fast).toBe('hash-fast');
  });

  it('reports no identity outside a request', () => {
    expect(currentRequestIdentity()).toBeUndefined();
  });

  it('carries the resolved address as well as its hash', () => {
    // The hash is what buckets and log lines may keep. The address itself is needed for exactly
    // one thing — the `X-Forwarded-For` on the server-side redeem, which is how core learns which
    // respondent is asking (bizapps-forms register row 29). Request-scoped, never persisted.
    const seen = runWithRequestIdentity({ ip: '203.0.113.7', ipHash: 'hash-7' }, () =>
      currentRequestIdentity(),
    );

    expect(seen).toEqual({ ip: '203.0.113.7', ipHash: 'hash-7' });
  });
});

// C-A (gauntlet #207, F3 + F1). `resolveClientIp` returns the X-Forwarded-For entry with `.trim()`
// only: every sanitiser this module owns — `stripSourcePort`, IPv6 zone removal, octet
// canonicalisation, unparseable handling — lives inside `normalizeIpForKeying`, which is reachable
// only from `hashClientIp`. That asymmetry was inert while the raw value never left the middleware.
// It does not leave it any more: the redeem forwards it to core AS AN ADDRESS, where it becomes a
// rate-limit key and an audited column. Two measured consequences of the one missing guard:
//   F3  `203.0.113.7:52431` -> core buckets per SOURCE PORT, so its 20/min cap never accumulates
//       (verified against express-rate-limit's real default key generator)
//   F1  a >64-character value -> core's `NVARCHAR(64)` audit write fails and the redemption row is
//       silently never written, while the session is still minted
describe('forwardableAddress — what may be sent to core as an address', () => {
  it('passes an ordinary IPv4 address through', () => {
    expect(forwardableAddress('198.51.100.7')).toBe('198.51.100.7');
  });

  it('passes an ordinary IPv6 address through', () => {
    expect(forwardableAddress('2001:db8::1')).toBe('2001:db8::1');
  });

  it('strips a source port some proxies append, rather than dropping the address', () => {
    // The address is still good; only the port is noise. Dropping it entirely would throw away a
    // correct respondent identity on Azure App Service, which writes this shape.
    expect(forwardableAddress('203.0.113.7:52431')).toBe('203.0.113.7');
  });

  it('gives the SAME answer whatever ephemeral port is attached', () => {
    // This is the defect itself: core keys its redeem cap on what we send, so a value that changes
    // per connection hands one caller an unlimited supply of buckets.
    expect(forwardableAddress('203.0.113.7:52431')).toBe(forwardableAddress('203.0.113.7:9001'));
  });

  it('strips an IPv6 zone index, which is local to the sender and meaningless to core', () => {
    expect(forwardableAddress('fe80::1%eth0')).toBe('fe80::1');
  });

  it('strips the brackets from a bracketed IPv6 address with a port', () => {
    expect(forwardableAddress('[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('refuses a value that is not an address at all', () => {
    expect(forwardableAddress('not-an-address')).toBeUndefined();
  });

  it('refuses an over-long value, which core cannot store and would drop the audit row for', () => {
    expect(forwardableAddress('x'.repeat(300))).toBeUndefined();
  });

  it('refuses punctuation and a lone dot', () => {
    expect(forwardableAddress('abc;def=ghi')).toBeUndefined();
    expect(forwardableAddress('.')).toBeUndefined();
  });

  it('refuses an absent or empty value without inventing one', () => {
    expect(forwardableAddress(undefined)).toBeUndefined();
    expect(forwardableAddress('   ')).toBeUndefined();
  });

  it('never returns a value longer than core\'s NVARCHAR(64) audit column', () => {
    // A postcondition on the whole function rather than on one input: whatever it lets through is
    // storable, so the F1 shape cannot come back through some other spelling.
    for (const raw of ['198.51.100.7', '2001:db8::1', '203.0.113.7:52431', 'fe80::1%eth0', '[2001:db8::1]:443']) {
      const out = forwardableAddress(raw);
      expect(out && out.length).toBeLessThanOrEqual(64);
    }
  });
});

