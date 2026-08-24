import { describe, it, expect, vi } from 'vitest';
import { CachedDefinition } from './cached-definition';

/**
 * THE BUG THIS GUARDS, and why identity rather than content is the thing being tested.
 *
 * `designPreviewDefinition` was a getter that called `buildPublishedDefinition` on every read, so
 * it returned a structurally identical but REFERENTIALLY NEW object each time. The builder runs
 * Default change detection, Angular diffs inputs with `Object.is`, and `<mj-form>` reloads from
 * `ngOnChanges` — so every change-detection tick tore the preview down and rebuilt it.
 *
 * What that looked like: clicking Start in the Design tab's preview did nothing, because the click's
 * own tick reset `phase` back to `welcome`. Trial answers were wiped continuously, and dragging a
 * colour reverted mid-drag as the SAVED style was re-applied. The reload path was correct; reading
 * the input was not.
 */
describe('CachedDefinition', () => {
  it('hands back the same object until something says otherwise', () => {
    const build = vi.fn(() => ({ name: 'RSVP' }));
    const cache = new CachedDefinition<{ name: string }>();

    const first = cache.read(build);
    const second = cache.read(build);

    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('rebuilds once the draft is marked changed', () => {
    let n = 0;
    const build = vi.fn(() => ({ name: `RSVP ${++n}` }));
    const cache = new CachedDefinition<{ name: string }>();

    const first = cache.read(build);
    cache.invalidate();
    const second = cache.read(build);

    expect(second).not.toBe(first);
    expect(second.name).toBe('RSVP 2');
  });

  it('settles again after one rebuild', () => {
    // One invalidation must cost exactly one rebuild, not put the cache back into a state where
    // every subsequent read rebuilds — which would reintroduce the storm one tick later.
    const build = vi.fn(() => ({ name: 'RSVP' }));
    const cache = new CachedDefinition<{ name: string }>();
    cache.read(build);
    cache.invalidate();
    cache.read(build);
    cache.read(build);
    cache.read(build);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('caches a null build result too', () => {
    // The builder returns null before its tree has loaded. Treating null as "not cached yet" would
    // rebuild on every tick for the whole of that window.
    const build = vi.fn(() => null);
    const cache = new CachedDefinition<{ name: string }>();
    expect(cache.read(build)).toBeNull();
    expect(cache.read(build)).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
  });
});
