/**
 * Where a generated image's bytes go, and the URL that comes back.
 *
 * A seam for the same reason the progress publisher is one: storing bytes needs
 * `@memberjunction/storage` and the asset pipeline, both of which live in `packages/Server`, and
 * `packages/Actions` must not grow a dependency on either.
 *
 * ── NO DEFAULT, DELIBERATELY. ────────────────────────────────────────────────────────────────
 * The progress publisher defaults to a no-op because a build with no progress is a build that
 * still works. There is no equivalent here: an image with nowhere to go is not "an image, quietly".
 * So an unregistered store means the image stage SKIPS and says so, rather than pretending to
 * generate pictures that land nowhere.
 */
import type { UserInfo } from '@memberjunction/core';

/** One stored image. */
export interface StoredGeneratedImage {
  /**
   * The absolute, stable URL to write onto `FormQuestionOption.ImageURL` / `FormScreen.MediaURL`.
   *
   * Absolute rather than relative because `<mj-form>` is an embeddable custom element: on a
   * customer's own page a relative `/forms/asset/…` resolves against THEIR origin and 404s.
   */
  url: string;
}

/** Stores generated image bytes somewhere a published form can load them from. */
export interface GeneratedImageStore {
  /**
   * Store `bytes` for `formId` and return the URL a respondent will load it from.
   *
   * Implementations MUST route through the same validation human uploads get — size cap, raster
   * allowlist, public asset prefix. An AI-generated file is no more trustworthy than an uploaded
   * one, and a second path into storage with its own rules is a second set of rules to keep right.
   *
   * Throws on failure. The image stage catches, degrades that image, and continues — images are
   * enhancement and never a gate.
   *
   * `Uint8Array` rather than `Buffer` because this package has no Node types and does not want
   * them: it never touches the bytes, only passes them. Every `Buffer` IS a `Uint8Array`, so the
   * server-side implementation hands one over unchanged.
   */
  store(
    formId: string,
    bytes: Uint8Array,
    contentType: string,
    fileName: string,
    contextUser: UserInfo,
  ): Promise<StoredGeneratedImage>;
}

let activeStore: GeneratedImageStore | undefined;

/** Install the store. Called by `packages/Server` at load; idempotent. */
export function setGeneratedImageStore(store: GeneratedImageStore): void {
  activeStore = store;
}

/** Remove the store. For tests that installed a stub, and for asserting the unregistered path. */
export function resetGeneratedImageStore(): void {
  activeStore = undefined;
}

/** The registered store, or `undefined` when nothing has registered one. */
export function getGeneratedImageStore(): GeneratedImageStore | undefined {
  return activeStore;
}
