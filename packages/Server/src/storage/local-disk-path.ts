/**
 * Turning a storage object name into a path on disk, safely.
 *
 * This is the whole security surface of the local storage driver, so it lives on its own
 * and is tested on its own. Object names reach the driver from an ANONYMOUS respondent's
 * upload: `FileStorageEngine` builds the storage path, but a driver that trusts whatever
 * it is handed and calls `path.join(root, name)` will happily write outside its root the
 * first time a name contains `..`. On a dev machine the root sits inside a working copy,
 * so "outside the root" means source files.
 *
 * Containment is therefore checked on the RESOLVED path rather than by inspecting the
 * name for suspicious substrings — blocklisting `..` misses encodings, symlink-ish inputs
 * and absolute paths, whereas resolve-then-verify is true regardless of how the escape was
 * spelled.
 */
import { isAbsolute, resolve, sep } from 'node:path';

/** Thrown when an object name resolves outside the storage root. */
export class PathEscapesRootError extends Error {
  constructor(objectName: string) {
    super(`Object name "${objectName}" resolves outside the storage root.`);
    this.name = 'PathEscapesRootError';
  }
}

/**
 * The absolute on-disk path for an object name, guaranteed to sit inside `root`.
 *
 * @throws {PathEscapesRootError} when the name would land outside the root, including via
 * `..` segments or an absolute path.
 */
export function resolveWithinRoot(root: string, objectName: string): string {
  const absoluteRoot = resolve(root);
  const trimmed = objectName.trim();
  if (trimmed.length === 0) {
    throw new PathEscapesRootError(objectName);
  }
  // An absolute object name would make `resolve` discard the root entirely.
  if (isAbsolute(trimmed)) {
    throw new PathEscapesRootError(objectName);
  }
  const target = resolve(absoluteRoot, trimmed);
  // The separator matters: without it, a sibling directory whose name merely STARTS with
  // the root's name ("/data/store-evil" against root "/data/store") passes a bare
  // startsWith check. Equality is allowed so the root itself resolves.
  if (target !== absoluteRoot && !target.startsWith(absoluteRoot + sep)) {
    throw new PathEscapesRootError(objectName);
  }
  return target;
}
