/**
 * Asset bytes held in process (#291).
 *
 * Why: `GET /forms/asset/<id>` re-read the object from the storage provider on every request, and
 * on Box a path read lists folders before it downloads (~2.5–3 s), so every respondent's welcome
 * image paid that round trip. An asset's bytes never change under its `MJ: Files` id — a new image
 * is a new upload, so a new id — so a copy is safe to keep.
 *
 * Bounded twice: a total budget with least-recently-used eviction, and a per-object cap so one
 * large image cannot flush the rest. A process-local copy, not a record: losing it (restart,
 * eviction, a second host) costs one provider read. It decides nothing about WHETHER a caller may
 * read an object — `loadAssetBytes` runs its guard before it asks.
 */
import { BaseSingleton } from '@memberjunction/global';

/** Total bytes kept across all assets. */
export const MAX_CACHED_ASSET_BYTES = 50 * 1024 * 1024;
/** Largest single object kept; a bigger one is served but not kept. */
export const MAX_CACHED_ASSET_ENTRY_BYTES = 8 * 1024 * 1024;

export class ByteBudgetCache {
  /** Map insertion order is recency order: re-inserted on every hit, oldest first. */
  private readonly entries = new Map<string, Buffer>();
  /** Loads in flight, so concurrent misses for one key share one provider read. */
  private readonly inFlight = new Map<string, Promise<Buffer>>();
  private totalBytes = 0;

  constructor(
    private readonly maxTotalBytes: number,
    private readonly maxEntryBytes: number,
  ) {
    if (!(maxEntryBytes > 0) || !(maxTotalBytes >= maxEntryBytes)) {
      throw new Error(`ByteBudgetCache: need 0 < maxEntryBytes (${maxEntryBytes}) <= maxTotalBytes (${maxTotalBytes}).`);
    }
  }

  public get TotalBytes(): number {
    return this.totalBytes;
  }

  /** Returns the kept copy; caller must not mutate it. */
  public Get(key: string): Buffer | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  public Put(key: string, bytes: Buffer): void {
    if (bytes.length > this.maxEntryBytes) return;
    this.remove(key);
    this.entries.set(key, bytes);
    this.totalBytes += bytes.length;
    this.evictOverBudget();
  }

  /** The kept bytes, else ONE shared `load()` whose result is kept on success only. The returned Buffer is the kept copy; callers must not mutate it. */
  public GetOrLoad(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.Get(key);
    if (hit) return Promise.resolve(hit);
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const started: Promise<Buffer> = load()
      .then((loaded) => {
        this.Put(key, loaded);
        return loaded;
      })
      .finally(() => {
        // Only our own entry: after Clear() a newer load for this key may be in flight.
        if (this.inFlight.get(key) === started) this.inFlight.delete(key);
      });
    this.inFlight.set(key, started);
    return started;
  }

  public Clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    this.totalBytes = 0;
  }

  private remove(key: string): void {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.totalBytes -= old.length;
    }
  }

  private evictOverBudget(): void {
    while (this.totalBytes > this.maxTotalBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.remove(oldest.value);
    }
  }
}

/** The process-wide asset cache, shared by the read route and the upload that warms it. */
export class AssetByteCache extends BaseSingleton<AssetByteCache> {
  public readonly Bytes = new ByteBudgetCache(MAX_CACHED_ASSET_BYTES, MAX_CACHED_ASSET_ENTRY_BYTES);

  protected constructor() {
    super();
  }

  public static get Instance(): AssetByteCache {
    return super.getInstance<AssetByteCache>();
  }
}
