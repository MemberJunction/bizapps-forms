/**
 * THROWAWAY local-disk FileStorageBase driver — dev harness only, never shipped.
 *
 * Purpose: give `FileStorageEngine.UploadFile` a place to put bytes on a machine with no
 * cloud storage account, so the résumé-upload path (issue #49 / R28) can be exercised for
 * real: bytes → disk, `MJ: Files` row, `FormUpload` provenance row, submit + binding.
 *
 * Registers under ServerDriverKey 'Local File Storage'; pair it with a
 * `__mj.FileStorageProvider` row whose ServerDriverKey matches and whose Configuration is
 * `{"baseDir": "<absolute path>"}`, plus a `__mj.FileStorageAccount` row with
 * CredentialID NULL (the engine then passes the provider Configuration to initialize()).
 *
 * Deliberately minimal: no pre-auth URLs (throws UnsupportedOperationError — sandbox
 * traffic goes through the API), no streaming, no search. Content types are kept in a
 * `.meta.json` sidecar next to each object.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RegisterClass } from '@memberjunction/global';
import { FileStorageBase } from '@memberjunction/storage';

const META_SUFFIX = '.meta.json';

class ThrowawayLocalFileStorage extends FileStorageBase {
  providerName = 'Local Disk (Throwaway Dev)';
  _baseDir = undefined;

  async initialize(config) {
    await super.initialize(config);
    const dir = config?.baseDir || process.env.FORMS_THROWAWAY_STORAGE_DIR;
    if (!dir) {
      throw new Error(
        'ThrowawayLocalFileStorage: no baseDir. Put {"baseDir": "..."} in the FileStorageProvider Configuration JSON.',
      );
    }
    this._baseDir = path.resolve(dir);
    await fs.mkdir(this._baseDir, { recursive: true });
  }

  /** Resolve an object name inside baseDir, refusing path escapes. */
  _resolve(objectName) {
    if (!this._baseDir) {
      throw new Error('ThrowawayLocalFileStorage: initialize() was not called.');
    }
    const p = path.resolve(this._baseDir, objectName);
    if (p !== this._baseDir && !p.startsWith(this._baseDir + path.sep)) {
      throw new Error(`ThrowawayLocalFileStorage: path escapes baseDir: ${objectName}`);
    }
    return p;
  }

  _nameOf(params) {
    const name = params?.fullPath ?? params?.objectId;
    if (!name) {
      throw new Error('ThrowawayLocalFileStorage: objectId or fullPath is required.');
    }
    return name;
  }

  async PutObject(objectName, data, contentType, metadata) {
    const p = this._resolve(objectName);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    await fs.writeFile(
      p + META_SUFFIX,
      JSON.stringify({ contentType: contentType ?? 'application/octet-stream', metadata: metadata ?? {} }),
    );
    return true;
  }

  async GetObject(params) {
    return fs.readFile(this._resolve(this._nameOf(params)));
  }

  async ObjectExists(objectName) {
    try {
      const st = await fs.stat(this._resolve(objectName));
      return st.isFile();
    } catch {
      return false;
    }
  }

  async DeleteObject(objectName) {
    const p = this._resolve(objectName);
    try {
      await fs.unlink(p);
    } catch {
      return false;
    }
    await fs.rm(p + META_SUFFIX, { force: true });
    return true;
  }

  async CopyObject(sourceObjectName, destinationObjectName) {
    const src = this._resolve(sourceObjectName);
    const dst = this._resolve(destinationObjectName);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
    await fs.cp(src + META_SUFFIX, dst + META_SUFFIX, { force: true }).catch(() => {});
    return true;
  }

  async MoveObject(oldObjectName, newObjectName) {
    const src = this._resolve(oldObjectName);
    const dst = this._resolve(newObjectName);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    await fs.rename(src + META_SUFFIX, dst + META_SUFFIX).catch(() => {});
    return true;
  }

  async GetObjectMetadata(params) {
    const name = this._nameOf(params);
    const p = this._resolve(name);
    const st = await fs.stat(p);
    let contentType = 'application/octet-stream';
    try {
      contentType = JSON.parse(await fs.readFile(p + META_SUFFIX, 'utf8')).contentType ?? contentType;
    } catch {
      // no sidecar — default stands
    }
    return {
      name: path.basename(name),
      path: path.dirname(name),
      fullPath: name,
      size: st.size,
      contentType,
      lastModified: st.mtime,
      isDirectory: st.isDirectory(),
    };
  }

  async ListObjects(prefix, _delimiter) {
    const root = this._resolve(prefix || '.');
    const objects = [];
    const prefixes = [];
    let entries = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return { objects, prefixes };
    }
    for (const e of entries) {
      const rel = path.join(prefix || '', e.name);
      if (e.isDirectory()) {
        prefixes.push(rel + '/');
      } else if (!e.name.endsWith(META_SUFFIX)) {
        objects.push(await this.GetObjectMetadata({ fullPath: rel }));
      }
    }
    return { objects, prefixes };
  }

  async CreateDirectory(directoryPath) {
    await fs.mkdir(this._resolve(directoryPath), { recursive: true });
    return true;
  }

  async DeleteDirectory(directoryPath, recursive) {
    const p = this._resolve(directoryPath);
    if (recursive) {
      await fs.rm(p, { recursive: true, force: true });
      return true;
    }
    try {
      await fs.rmdir(p);
      return true;
    } catch {
      return false;
    }
  }

  async DirectoryExists(directoryPath) {
    try {
      const st = await fs.stat(this._resolve(directoryPath));
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  async CreatePreAuthUploadUrl(_objectName) {
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
  }

  async CreatePreAuthDownloadUrl(_objectName) {
    this.throwUnsupportedOperationError('CreatePreAuthDownloadUrl');
  }
}

// Manual decorator application (plain JS, no TS decorators here).
RegisterClass(FileStorageBase, 'Local File Storage')(ThrowawayLocalFileStorage);

export { ThrowawayLocalFileStorage };
