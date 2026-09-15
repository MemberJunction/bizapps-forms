import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  ASSET_STORAGE_PREFIX,
  assertUploadPrefixIsPrivate,
  assetPathPrefix,
  assetPublicUrl,
  assetTypeAllowed,
  getAssetConfig,
  isPublicAssetKey,
  resetAssetConfigForTests,
} from '../config';

const ENV_KEYS = [
  'FORMS_ASSET_ENABLED',
  'FORMS_ASSET_MAX_BYTES',
  'FORMS_ASSET_ALLOWED_TYPES',
  'FORMS_ASSET_STORAGE_ACCOUNT',
  'MJAPI_PUBLIC_URL',
] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resetAssetConfigForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetAssetConfigForTests();
});

describe('getAssetConfig', () => {
  it('defaults to enabled, 5 MiB, raster images only', () => {
    const cfg = getAssetConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxBytes).toBe(5 * 1024 * 1024);
    expect(cfg.allowedTypes).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  });

  it('excludes SVG by default', () => {
    // Not an oversight: these bytes are served from the MJAPI origin, and an SVG is a document
    // that can carry script. Opting in is an operator decision, not a default.
    expect(assetTypeAllowed('image/svg+xml', getAssetConfig().allowedTypes)).toBe(false);
  });

  it('honours an explicit allowlist, including SVG opt-in', () => {
    process.env.FORMS_ASSET_ALLOWED_TYPES = 'image/png, image/svg+xml';
    const cfg = getAssetConfig();
    expect(assetTypeAllowed('image/svg+xml', cfg.allowedTypes)).toBe(true);
    expect(assetTypeAllowed('image/webp', cfg.allowedTypes)).toBe(false);
  });

  it('falls back to the default cap for a non-positive or unparseable size', () => {
    for (const raw of ['0', '-1', 'lots']) {
      resetAssetConfigForTests();
      process.env.FORMS_ASSET_MAX_BYTES = raw;
      expect(getAssetConfig().maxBytes).toBe(5 * 1024 * 1024);
    }
  });

  it('is off only for an explicit "false"', () => {
    process.env.FORMS_ASSET_ENABLED = 'no';
    expect(getAssetConfig().enabled).toBe(true);
    resetAssetConfigForTests();
    process.env.FORMS_ASSET_ENABLED = 'false';
    expect(getAssetConfig().enabled).toBe(false);
  });
});

describe('assetTypeAllowed', () => {
  it('ignores a charset parameter and matches case-insensitively', () => {
    expect(assetTypeAllowed('IMAGE/PNG; charset=binary', ['image/png'])).toBe(true);
  });

  it('supports a family wildcard', () => {
    expect(assetTypeAllowed('image/avif', ['image/*'])).toBe(true);
    expect(assetTypeAllowed('text/html', ['image/*'])).toBe(false);
  });

  it('rejects a blank content type fail-closed', () => {
    expect(assetTypeAllowed(undefined, ['image/*'])).toBe(false);
    expect(assetTypeAllowed('   ', ['image/*'])).toBe(false);
  });
});

describe('the public-prefix invariant', () => {
  it('recognises an asset key and nothing else', () => {
    expect(isPublicAssetKey(`${ASSET_STORAGE_PREFIX}/form-id/2026/logo.png`)).toBe(true);
    expect(isPublicAssetKey('forms-uploads/2026-08-18/resume.pdf')).toBe(false);
    expect(isPublicAssetKey('artifacts/2026-08-18/x.png')).toBe(false);
    expect(isPublicAssetKey(null)).toBe(false);
  });

  it('does NOT treat a lookalike sibling prefix as public', () => {
    // `startsWith('forms-assets')` without the separator would publish this. The separator is
    // what stops a neighbouring bucket folder inheriting the invariant.
    expect(isPublicAssetKey('forms-assets-private/secret.png')).toBe(false);
  });

  it('refuses a respondent-upload prefix that lands under the asset tree', () => {
    // The one configuration that would silently publish every file a respondent uploaded.
    for (const bad of [ASSET_STORAGE_PREFIX, `${ASSET_STORAGE_PREFIX}/uploads`]) {
      const verdict = assertUploadPrefixIsPrivate(bad);
      expect(verdict.prefix).toBeUndefined();
      expect(verdict.refused).toContain('without authentication');
    }
  });

  it('passes through any prefix outside the asset tree unchanged', () => {
    expect(assertUploadPrefixIsPrivate('forms-uploads/2026')).toEqual({ prefix: 'forms-uploads/2026' });
    expect(assertUploadPrefixIsPrivate('forms-assets-private')).toEqual({ prefix: 'forms-assets-private' });
    expect(assertUploadPrefixIsPrivate(undefined)).toEqual({ prefix: undefined });
  });

  it('writes assets under the public prefix, partitioned by form', () => {
    const prefix = assetPathPrefix('44444444-4444-4444-4444-444444444444');
    expect(prefix.startsWith(`${ASSET_STORAGE_PREFIX}/44444444-4444-4444-4444-444444444444/`)).toBe(true);
    expect(isPublicAssetKey(`${prefix}/logo.png`)).toBe(true);
  });

  // The object key is `<pathPrefix>/<fileName>`, and two images can honestly share a file name:
  // a welcome screen's `logo.png` and an ending screen's, or four picture-choice options that
  // all came off a phone as `IMG_0001.jpg`. Without a unique segment the second write silently
  // overwrites the first while its own `MJ: Files` row is created happily — and the asset route
  // serves these `immutable` for a year, so every respondent who already loaded the first one
  // keeps the wrong image until the cache expires.
  it('gives every asset its own path, so two same-named images cannot collide', () => {
    const formId = '44444444-4444-4444-4444-444444444444';
    expect(assetPathPrefix(formId)).not.toBe(assetPathPrefix(formId));
  });
});

describe('assetPublicUrl', () => {
  it('builds against MJAPI_PUBLIC_URL, trimming a trailing slash', () => {
    process.env.MJAPI_PUBLIC_URL = 'https://api.example.com/';
    expect(assetPublicUrl('abc')).toBe('https://api.example.com/forms/asset/abc');
  });

  it('falls back to the request origin, then to the local API port', () => {
    expect(assetPublicUrl('abc', 'http://10.0.0.5:4121')).toBe('http://10.0.0.5:4121/forms/asset/abc');
    expect(assetPublicUrl('abc')).toBe('http://localhost:4121/forms/asset/abc');
  });

  it('is absolute, because the widget is embedded on other origins', () => {
    // A relative URL would resolve against the CUSTOMER's site inside an embedded <mj-form>
    // and 404 there while looking perfectly fine in the builder preview.
    process.env.MJAPI_PUBLIC_URL = 'https://api.example.com';
    expect(assetPublicUrl('abc').startsWith('https://')).toBe(true);
  });
});
