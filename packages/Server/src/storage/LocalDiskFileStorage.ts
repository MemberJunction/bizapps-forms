/**
 * A file-storage driver that writes to the local disk. FOR DEVELOPMENT ONLY.
 *
 * WHY THIS EXISTS. MJ ships seven storage drivers and every one of them is a cloud
 * service — AWS, Azure, Box, Dropbox, Google Drive, Google Cloud, SharePoint. There is no
 * local option, so on a developer's machine `FileStorageEngine.UploadFile` fails with
 * "no file storage accounts configured" and every path that stores bytes is untestable:
 * FileUpload answers, and Signature answers, which are FileUpload answers whose file came
 * from a canvas. Testing a signature end to end therefore required cloud credentials,
 * which is an absurd price for "does the pad save".
 *
 * WHY IT IS SAFE TO HAVE AROUND. It refuses to initialise unless
 * `FORMS_LOCAL_STORAGE_ROOT` is set, so it cannot become the accidental default: a
 * deployment that never sets it gets the same "not configured" failure it gets today
 * rather than silently writing customer uploads onto an ephemeral container disk. The
 * driver is also useless without a `FileStorageAccount` row pointing at it, and this repo
 * ships no migration creating one — see `scripts/dev-local-storage.mjs`, which seeds it
 * locally and is deliberately not part of the shipped migration set.
 *
 * WHAT IT DOES NOT DO. Pre-authenticated upload/download URLs are refused with
 * `UnsupportedOperationError`, the mechanism the base class provides for exactly this.
 * They are a signed-URL handshake with a cloud endpoint; serving their local equivalent
 * would mean standing up an HTTP route that hands out file bytes, which is a security
 * decision this dev convenience has no business making on its own. Nothing in Forms calls
 * them today.
 */
import { mkdir, copyFile, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, posix, relative, sep } from 'node:path';

import { RegisterClass } from '@memberjunction/global';
import {
  FileStorageBase,
  UnsupportedOperationError,
  type CreatePreAuthUploadUrlPayload,
  type FileSearchOptions,
  type FileSearchResultSet,
  type GetObjectMetadataParams,
  type GetObjectParams,
  type StorageListResult,
  type StorageObjectMetadata,
  type StorageProviderConfig,
} from '@memberjunction/storage';

import { resolveWithinRoot } from './local-disk-path';

/** The `ServerDriverKey` a `FileStorageProvider` row must carry to select this driver. */
export const LOCAL_DISK_DRIVER_KEY = 'Local Disk Storage';

/** Env var naming the directory files are written under. Absent = driver stays off. */
export const LOCAL_STORAGE_ROOT_VAR = 'FORMS_LOCAL_STORAGE_ROOT';

@RegisterClass(FileStorageBase, LOCAL_DISK_DRIVER_KEY)
export class LocalDiskFileStorage extends FileStorageBase {
  protected readonly providerName = LOCAL_DISK_DRIVER_KEY;

  /** Absolute directory every object lives under; empty until configured. */
  private root = '';

  constructor() {
    super();
    this.root = (process.env[LOCAL_STORAGE_ROOT_VAR] ?? '').trim();
  }

  public override async initialize(config?: StorageProviderConfig): Promise<void> {
    await super.initialize(config);
    const fromConfig = typeof config?.['root'] === 'string' ? (config['root'] as string).trim() : '';
    this.root = fromConfig || (process.env[LOCAL_STORAGE_ROOT_VAR] ?? '').trim();
    if (this.root) {
      await mkdir(this.root, { recursive: true });
    }
  }

  public get IsConfigured(): boolean {
    return this.root.length > 0;
  }

  // ------------------------------------------------------------------ objects

  public async PutObject(
    objectName: string,
    data: Buffer,
    _contentType?: string,
    _metadata?: Record<string, string>,
  ): Promise<boolean> {
    const target = this.pathFor(objectName);
    // The engine hands down a nested storage path; the directories in it will not exist on
    // the first upload of any new prefix.
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return true;
  }

  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    return readFile(this.pathFor(this.nameFrom(params)));
  }

  public async ObjectExists(objectName: string): Promise<boolean> {
    return this.isOfType(objectName, 'file');
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    await rm(this.pathFor(objectName), { force: true });
    return true;
  }

  public async CopyObject(source: string, destination: string): Promise<boolean> {
    const to = this.pathFor(destination);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(this.pathFor(source), to);
    return true;
  }

  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    const to = this.pathFor(newObjectName);
    await mkdir(dirname(to), { recursive: true });
    await rename(this.pathFor(oldObjectName), to);
    return true;
  }

  public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    const objectName = this.nameFrom(params);
    const info = await stat(this.pathFor(objectName));
    return this.describe(objectName, info.size, info.mtime, info.isDirectory());
  }

  // -------------------------------------------------------------- directories

  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    await mkdir(this.pathFor(directoryPath), { recursive: true });
    return true;
  }

  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    await rm(this.pathFor(directoryPath), { recursive, force: true });
    return true;
  }

  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    return this.isOfType(directoryPath, 'dir');
  }

  public async ListObjects(prefix: string, _delimiter?: string): Promise<StorageListResult> {
    const dir = this.pathFor(prefix || '.');
    // A prefix with nothing under it is an ordinary, expected answer — "no objects yet" — and
    // ENOENT is how the filesystem says it. Anything else (a permission problem, an I/O error, a
    // root that was deleted out from under us) is NOT an empty listing, and reporting it as one
    // would let a broken store read as a working, empty store.
    const entries = await readdir(dir, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
      if (err?.code === 'ENOENT') {
        return [];
      }
      throw new Error(`Could not list local storage objects under "${prefix}" (${dir}): ${err?.message ?? err}`);
    });
    const objects: StorageObjectMetadata[] = [];
    const prefixes: string[] = [];
    for (const entry of entries) {
      const childName = posix.join(this.toPosix(prefix), entry.name);
      if (entry.isDirectory()) {
        prefixes.push(childName);
        continue;
      }
      const info = await stat(join(dir, entry.name));
      objects.push(this.describe(childName, info.size, info.mtime, false));
    }
    return { objects, prefixes };
  }

  // ------------------------------------------------------------- not supported

  public async CreatePreAuthUploadUrl(_objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    throw new UnsupportedOperationError('CreatePreAuthUploadUrl', this.providerName);
  }

  public async CreatePreAuthDownloadUrl(_objectName: string): Promise<string> {
    throw new UnsupportedOperationError('CreatePreAuthDownloadUrl', this.providerName);
  }

  public async SearchFiles(
    _query: string,
    _options?: FileSearchOptions,
  ): Promise<FileSearchResultSet> {
    throw new UnsupportedOperationError('SearchFiles', this.providerName);
  }

  // ------------------------------------------------------------------ internals

  /**
   * The on-disk path for an object name.
   *
   * Fails loudly when unconfigured rather than defaulting to the process working
   * directory: a driver that silently picks a root writes uploads somewhere nobody chose,
   * and on a dev box that is the middle of a source tree.
   */
  private pathFor(objectName: string): string {
    if (!this.IsConfigured) {
      throw new Error(
        `${this.providerName} is not configured — set ${LOCAL_STORAGE_ROOT_VAR} to the directory uploads should be written to.`,
      );
    }
    return resolveWithinRoot(this.root, objectName);
  }

  /** Both metadata params types name the object either by id or by full path. */
  private nameFrom(params: GetObjectParams | GetObjectMetadataParams): string {
    return params.fullPath ?? params.objectId ?? '';
  }

  /** `stat` throws for a missing path; absence is an answer here, not a failure. */
  private async isOfType(name: string, kind: 'file' | 'dir'): Promise<boolean> {
    try {
      const info = await stat(this.pathFor(name));
      return kind === 'file' ? info.isFile() : info.isDirectory();
    } catch {
      return false;
    }
  }

  private describe(
    objectName: string,
    size: number,
    lastModified: Date,
    isDirectory: boolean,
  ): StorageObjectMetadata {
    const full = this.toPosix(objectName);
    return {
      name: basename(full),
      path: posix.dirname(full) === '.' ? '' : posix.dirname(full),
      fullPath: full,
      size,
      // Deliberately generic: the local driver stores bytes only. The real content type
      // travels on the `MJ: Files` row the engine writes, which is what readers use.
      contentType: 'application/octet-stream',
      lastModified,
      isDirectory,
    };
  }

  /** Storage object names are POSIX-style regardless of the host OS. */
  private toPosix(value: string): string {
    return relative('.', value || '.').split(sep).join(posix.sep);
  }
}
