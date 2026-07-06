import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_TURNSTILE_SCRIPT_URL,
  ensureTurnstileScript,
  getTurnstile,
  resetTurnstileLoaderForTest,
  type TurnstileApi,
} from './turnstile-loader';

/**
 * Minimal fake `<script>` that fires `load` (or `error`) on the next microtask so the
 * loader's event listeners resolve without a real browser or network. `id` is honored so
 * `document.getElementById` can find an already-injected script.
 */
class FakeScript {
  public id = '';
  public src = '';
  public async = false;
  public defer = false;
  public shouldError = false;
  private listeners: Record<string, Array<() => void>> = {};

  public addEventListener(type: string, cb: () => void): void {
    (this.listeners[type] ??= []).push(cb);
  }

  public fire(type: string): void {
    for (const cb of this.listeners[type] ?? []) {
      cb();
    }
  }
}

interface FakeGlobals {
  window?: { turnstile?: TurnstileApi };
  document?: {
    createElement: () => FakeScript;
    getElementById: (id: string) => FakeScript | null;
    head: { appendChild: (s: FakeScript) => void };
  };
}

const g = globalThis as unknown as FakeGlobals;
let appended: FakeScript[] = [];

function installFakeDom(): void {
  appended = [];
  const byId = new Map<string, FakeScript>();
  g.window = {};
  g.document = {
    createElement: () => new FakeScript(),
    getElementById: (id: string) => byId.get(id) ?? null,
    head: {
      appendChild: (s: FakeScript) => {
        appended.push(s);
        if (s.id) {
          byId.set(s.id, s);
        }
      },
    },
  };
}

/** Simulate the Cloudflare script finishing loading: define the global + fire `load`. */
function completeLoad(): void {
  g.window!.turnstile = {
    render: () => 'widget-1',
    reset: () => undefined,
    remove: () => undefined,
  };
  for (const s of appended) {
    s.fire('load');
  }
}

describe('turnstile-loader', () => {
  beforeEach(() => {
    resetTurnstileLoaderForTest();
    installFakeDom();
  });

  afterEach(() => {
    resetTurnstileLoaderForTest();
    delete g.window;
    delete g.document;
  });

  it('getTurnstile returns undefined until the global appears', () => {
    expect(getTurnstile()).toBeUndefined();
    g.window!.turnstile = { render: () => 'x', reset: () => {}, remove: () => {} };
    expect(getTurnstile()).toBeDefined();
  });

  it('injects the script exactly once and resolves when the global is ready', async () => {
    const p = ensureTurnstileScript();
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe(DEFAULT_TURNSTILE_SCRIPT_URL);
    completeLoad();
    await expect(p).resolves.toBeUndefined();
  });

  it('does not inject a second script for concurrent/subsequent callers', async () => {
    const p1 = ensureTurnstileScript();
    const p2 = ensureTurnstileScript();
    expect(appended).toHaveLength(1);
    completeLoad();
    await Promise.all([p1, p2]);
    // Already loaded -> resolves immediately, still no new script.
    await ensureTurnstileScript();
    expect(appended).toHaveLength(1);
  });

  it('honors a custom script URL override', () => {
    const custom = 'https://example.test/turnstile.js';
    void ensureTurnstileScript(custom);
    expect(appended[0].src).toBe(custom);
  });

  it('rejects (and allows retry) when the script errors', async () => {
    const p = ensureTurnstileScript();
    appended[0].fire('error');
    await expect(p).rejects.toThrow(/failed to load/i);
    // After a failure the load state is cleared so a later attempt injects again.
    const p2 = ensureTurnstileScript();
    completeLoad();
    await expect(p2).resolves.toBeUndefined();
  });
});
