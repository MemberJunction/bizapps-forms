/**
 * The abuse identity is the one input to the public-submit rate limiter that an attacker must
 * not be able to choose. These tests pin exactly that: which bytes we are willing to derive it
 * from, and under what configuration.
 */
import { describe, expect, it } from 'vitest';
import {
  currentRequestIdentity,
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
      runWithRequestIdentity({ ipHash: 'hash-slow' }, () => observe(20)),
      runWithRequestIdentity({ ipHash: 'hash-fast' }, () => observe(1)),
    ]);

    expect(slow).toBe('hash-slow');
    expect(fast).toBe('hash-fast');
  });

  it('reports no identity outside a request', () => {
    expect(currentRequestIdentity()).toBeUndefined();
  });
});

