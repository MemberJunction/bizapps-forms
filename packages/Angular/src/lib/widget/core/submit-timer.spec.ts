import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubmitTimer } from './submit-timer';

describe('SubmitTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('Elapsed() is 0 before Start', () => {
    expect(new SubmitTimer().Elapsed()).toBe(0);
  });

  it('Elapsed() grows after 250 ms', () => {
    const t = new SubmitTimer();
    t.Start();
    vi.advanceTimersByTime(249);
    expect(t.Elapsed()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(t.Elapsed()).toBe(250);
    vi.advanceTimersByTime(250);
    expect(t.Elapsed()).toBe(500);
    t.Stop();
  });

  it('Elapsed() is 0 again after Stop, and stays 0', () => {
    const t = new SubmitTimer();
    t.Start();
    vi.advanceTimersByTime(500);
    t.Stop();
    expect(t.Elapsed()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(t.Elapsed()).toBe(0);
  });

  it('Stop twice does not throw', () => {
    const t = new SubmitTimer();
    t.Start();
    t.Stop();
    expect(() => t.Stop()).not.toThrow();
  });

  it('Stop before Start does not throw', () => {
    expect(() => new SubmitTimer().Stop()).not.toThrow();
  });

  it('Start while running restarts from 0 with one interval', () => {
    const t = new SubmitTimer();
    t.Start();
    vi.advanceTimersByTime(500);
    expect(t.Elapsed()).toBe(500);
    t.Start();
    expect(t.Elapsed()).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(250);
    expect(t.Elapsed()).toBe(250);
    t.Stop();
  });

  it('LogOutcome writes one console.info line containing completed or failed and the elapsed ms', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const t = new SubmitTimer();
    t.Start();
    vi.advanceTimersByTime(1234);
    t.LogOutcome(true);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      '[mj-form] submit completed in 1234ms (client round trip; see the API log for the server-side stage breakdown)',
    );
    info.mockClear();
    t.LogOutcome(false);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      '[mj-form] submit failed in 1234ms (client round trip; see the API log for the server-side stage breakdown)',
    );
    t.Stop();
  });
});
