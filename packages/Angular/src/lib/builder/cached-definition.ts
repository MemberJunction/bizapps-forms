/**
 * A value that is rebuilt only when something says the draft changed.
 *
 * ── WHY THIS EXISTS AT ALL. ──────────────────────────────────────────────────────────────────
 * The Design tab's preview is fed by a getter, and a getter that builds its answer returns a new
 * object on every read. Angular diffs inputs with `Object.is`, `<mj-form>` reloads from
 * `ngOnChanges`, and the builder runs Default change detection — so a fresh object per read meant
 * a full teardown and reload of the preview on every change-detection tick. Clicking Start did
 * nothing, because the click's own tick put the phase back to `welcome`.
 *
 * ── INVALIDATION IS BOUND TO A SIGNAL THAT ALREADY EXISTS. ───────────────────────────────────
 * `markDirty()` is the builder's "the draft changed" hook, called from every mutation path and
 * from `refreshPublishState`, and the publish button's own `dirty` flag already depends on it
 * being right. Hanging the preview off the same signal means there is ONE invariant to keep rather
 * than two: a path that forgot to mark dirty would already be shipping a wrong Publish state, so
 * this cannot go stale on its own.
 *
 * Deliberately not content-hashing: fingerprinting the built definition on every tick would be
 * correct but pays a serialise per tick to discover what the invalidation signal already knows.
 */
export class CachedDefinition<T> {
  private cached: T | null = null;
  private stale = true;

  /** Mark the cached value out of date. The next {@link read} rebuilds; reads after it do not. */
  public invalidate(): void {
    this.stale = true;
  }

  /**
   * The current value, building it only if it is stale.
   *
   * `null` is cached like any other answer — the builder returns null until its tree has loaded,
   * and treating that as "nothing cached" would rebuild on every tick for the whole of that window.
   */
  public read(build: () => T | null): T | null {
    if (this.stale) {
      this.cached = build();
      this.stale = false;
    }
    return this.cached;
  }
}
