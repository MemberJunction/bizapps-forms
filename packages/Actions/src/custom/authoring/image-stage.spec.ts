import { describe, it, expect, afterEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
  imageDegradation,
  reasonFromDegradation,
  runImageStage,
  type ImageRequest,
} from './image-stage';
import { resetGeneratedImageStore, setGeneratedImageStore } from './generated-image-store';

const FORM_ID = '11111111-2222-4333-8444-555555555555';
const user = new UserInfo();
const request: ImageRequest = {
  prompt: 'a sunlit conference hall',
  target: { kind: 'screen', screenId: '66666666-7777-4888-8999-aaaaaaaaaaaa' },
  describedAs: 'the welcome screen',
};

afterEach(() => resetGeneratedImageStore());

/**
 * The two halves of one format. Tested together because the only thing making the separator safe
 * to parse is that a single pair of functions owns it — a test of either alone would pass while
 * they disagreed.
 */
describe('image degradation markers', () => {
  it('round-trips the reason', () => {
    const marker = imageDegradation('the welcome screen', 'No API key found for OpenAIImageGenerator');
    expect(reasonFromDegradation(marker)).toBe('No API key found for OpenAIImageGenerator');
  });

  it('still starts with the image: prefix the build summary groups on', () => {
    expect(imageDegradation('the hero', 'nope')).toMatch(/^image:/);
  });

  it('keeps the target in the marker, for a summary that lists several', () => {
    expect(imageDegradation('option "Rooftop"', 'nope')).toContain('option "Rooftop"');
  });

  it('reads a marker that carries no reason as its own text', () => {
    // `image:no store configured on this instance` is written directly, not through the builder,
    // because there is no per-image target to name — the whole stage stopped.
    expect(reasonFromDegradation('image:no store configured on this instance')).toBe(
      'no store configured on this instance',
    );
  });

  it('survives a reason that itself contains a dash', () => {
    const marker = imageDegradation('the hero', 'rate-limited — try again in 60s');
    expect(reasonFromDegradation(marker)).toBe('rate-limited — try again in 60s');
  });

  it('carries a real generator failure all the way out of the stage', async () => {
    setGeneratedImageStore({ store: async () => ({ url: 'https://assets.example/x' }) });
    const outcome = await runImageStage(
      FORM_ID,
      [request],
      {
        generate: async () => {
          throw new Error('No API key found for GeminiImageGenerator or vendor Google');
        },
      },
      user,
    );
    expect(outcome.stored).toEqual([]);
    expect(reasonFromDegradation(outcome.degraded[0])).toBe(
      'No API key found for GeminiImageGenerator or vendor Google',
    );
  });
});

/**
 * The stored file's name, asserted through the store the stage calls rather than on the private
 * helper — what matters is that the name the store receives matches the BYTES it receives.
 */
describe('the generated file name follows the bytes', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/jpeg; charset=binary', 'jpg'],
    // Not in the raster allowlist, so it never reaches storage anyway; naming it `.img` beats
    // naming it `.png` and lying about it.
    ['application/octet-stream', 'img'],
  ];

  it.each(cases)('%s is stored with a .%s name', async (contentType, extension) => {
    let seen = '';
    setGeneratedImageStore({
      store: async (_formId, _bytes, _contentType, fileName) => {
        seen = fileName;
        return { url: 'https://assets.example/x' };
      },
    });

    await runImageStage(
      FORM_ID,
      [request],
      { generate: async () => ({ bytes: new Uint8Array([1]), contentType }) },
      user,
    );

    expect(seen).toBe(`the-welcome-screen.${extension}`);
  });
});
