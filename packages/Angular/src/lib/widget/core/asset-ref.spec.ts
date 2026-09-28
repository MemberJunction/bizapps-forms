import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import { mapCssUrls, mapDefinitionAssets, mapStyleTokenAssets, originOf, resolveAssetUrl, toAssetRef } from './asset-ref';

const ID = 'a1137587-b23a-4f0d-9049-efc0bdcfc59a';
const ID_UPPER = 'A1137587-B23A-4F0D-9049-EFC0BDCFC59A';

describe('toAssetRef', () => {
  it('relativises an absolute localhost asset URL', () => {
    expect(toAssetRef(`http://localhost:4000/forms/asset/${ID_UPPER}`)).toBe(`/forms/asset/${ID_UPPER}`);
  });

  it('relativises an absolute deployed-host asset URL', () => {
    expect(toAssetRef(`https://deployed.example/forms/asset/${ID_UPPER}`)).toBe(`/forms/asset/${ID_UPPER}`);
  });

  it('leaves an already-relative asset reference unchanged', () => {
    expect(toAssetRef(`/forms/asset/${ID_UPPER}`)).toBe(`/forms/asset/${ID_UPPER}`);
  });

  it('recognises the route case-insensitively', () => {
    expect(toAssetRef(`https://x.com/Forms/Asset/${ID_UPPER}`)).toBe(`/forms/asset/${ID_UPPER}`);
  });

  it('recognises a trailing slash', () => {
    expect(toAssetRef(`https://x.com/forms/asset/${ID_UPPER}/`)).toBe(`/forms/asset/${ID_UPPER}`);
  });

  it('leaves a non-asset URL unchanged', () => {
    expect(toAssetRef('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
  });

  it('leaves an asset-shaped path with a non-GUID segment unchanged', () => {
    expect(toAssetRef('https://x.com/forms/asset/not-a-guid')).toBe('https://x.com/forms/asset/not-a-guid');
  });

  it('leaves an asset URL with a query string unchanged (not ours)', () => {
    expect(toAssetRef(`https://x.com/forms/asset/${ID}?v=2`)).toBe(`https://x.com/forms/asset/${ID}?v=2`);
  });

  it('leaves an asset URL with a trailing path segment unchanged', () => {
    expect(toAssetRef(`https://x.com/forms/asset/${ID}/extra`)).toBe(`https://x.com/forms/asset/${ID}/extra`);
  });

  it('leaves an empty string unchanged', () => {
    expect(toAssetRef('')).toBe('');
  });

  it('leaves a data URI unchanged', () => {
    expect(toAssetRef('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });

  it('leaves a rootless relative path unchanged (no leading slash)', () => {
    expect(toAssetRef(`forms/asset/${ID}`)).toBe(`forms/asset/${ID}`);
  });
});

describe('resolveAssetUrl', () => {
  it('makes a relative asset reference absolute on the given origin', () => {
    expect(resolveAssetUrl(`/forms/asset/${ID}`, 'https://api.example.com')).toBe(
      `https://api.example.com/forms/asset/${ID}`,
    );
  });

  it('rewrites a legacy absolute asset URL to a different origin', () => {
    expect(resolveAssetUrl(`http://localhost:4000/forms/asset/${ID}`, 'https://api.example.com')).toBe(
      `https://api.example.com/forms/asset/${ID}`,
    );
  });

  it('returns the value unchanged when apiOrigin is empty', () => {
    expect(resolveAssetUrl(`/forms/asset/${ID}`, '')).toBe(`/forms/asset/${ID}`);
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(resolveAssetUrl(`/forms/asset/${ID}`, 'https://api.example.com/')).toBe(
      `https://api.example.com/forms/asset/${ID}`,
    );
  });

  it('leaves an external URL unchanged regardless of origin', () => {
    expect(resolveAssetUrl('https://cdn.example.com/logo.png', 'https://api.example.com')).toBe(
      'https://cdn.example.com/logo.png',
    );
  });
});

describe('originOf', () => {
  it('strips the trailing slash of a bare origin', () => {
    expect(originOf('http://localhost:4131/')).toBe('http://localhost:4131');
  });

  it('drops the path of a full URL', () => {
    expect(originOf('https://h/graphql')).toBe('https://h');
  });

  it('returns empty for an empty string', () => {
    expect(originOf('')).toBe('');
  });

  it('returns empty for a relative path', () => {
    expect(originOf('/graphql')).toBe('');
  });
});

describe('mapCssUrls', () => {
  it('maps a double-quoted url()', () => {
    expect(mapCssUrls(`url("http://a/forms/asset/${ID}")`, toAssetRef)).toBe(`url("/forms/asset/${ID}")`);
  });

  it('keeps unquoted url() unquoted', () => {
    expect(mapCssUrls(`url(http://a/forms/asset/${ID})`, toAssetRef)).toBe(`url(/forms/asset/${ID})`);
  });

  it('keeps single-quoted url() single-quoted', () => {
    expect(mapCssUrls(`url('http://a/forms/asset/${ID}')`, toAssetRef)).toBe(`url('/forms/asset/${ID}')`);
  });

  it('maps two urls in one string', () => {
    const css = `background: url("http://a/forms/asset/${ID}"), url('http://b/forms/asset/${ID}')`;
    expect(mapCssUrls(css, toAssetRef)).toBe(`background: url("/forms/asset/${ID}"), url('/forms/asset/${ID}')`);
  });

  it('leaves a non-asset url() untouched', () => {
    expect(mapCssUrls('url(https://cdn/x.png)', toAssetRef)).toBe('url(https://cdn/x.png)');
  });

  it('leaves a string with no url() unchanged', () => {
    expect(mapCssUrls('color: red;', toAssetRef)).toBe('color: red;');
  });
});

/** Minimal published-form fixture (shape borrowed from form-runtime.spec.ts / shown-screen.spec.ts). */
function definition(): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Test form',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: {
      cssVariables: {
        '--mjf-page-bg-image': `url("http://old/forms/asset/${ID}")`,
        '--mj-brand-primary': '#123456',
      },
      customCSS: `.x { background: url("http://old/forms/asset/${ID}"); }`,
      logoURL: `http://old/forms/asset/${ID}`,
    },
    welcomeScreen: {
      id: 'w1',
      screenType: 'Welcome',
      title: 'Hello',
      displayOrder: 0,
      mediaURL: `http://old/forms/asset/${ID}`,
    },
    endScreens: [
      { id: 'e1', screenType: 'Ending', title: 'Thanks', displayOrder: 0, mediaURL: `http://old/forms/asset/${ID}` },
      { id: 'e2', screenType: 'Ending', title: 'Bye', displayOrder: 1 },
    ],
    automations: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 0,
        questions: [
          {
            id: 'q1',
            type: 'PictureChoice',
            prompt: 'Pick one',
            isRequired: false,
            displayOrder: 0,
            options: [
              {
                id: 'o1',
                label: 'A',
                value: 'a',
                displayOrder: 0,
                imageURL: `http://old/forms/asset/${ID}`,
              },
              { id: 'o2', label: 'B', value: 'b', displayOrder: 1 },
            ],
          },
        ],
      },
    ],
  };
}

describe('mapStyleTokenAssets', () => {
  it('maps logoURL and every cssVariables/customCSS asset url, leaving non-asset values alone', () => {
    const tokens = definition().styleTokens;
    const before = structuredClone(tokens);
    const mapped = mapStyleTokenAssets(tokens, toAssetRef);

    expect(mapped.logoURL).toBe(`/forms/asset/${ID}`);
    expect(mapped.cssVariables['--mjf-page-bg-image']).toBe(`url("/forms/asset/${ID}")`);
    expect(mapped.cssVariables['--mj-brand-primary']).toBe('#123456');
    expect(mapped.customCSS).toBe(`.x { background: url("/forms/asset/${ID}"); }`);
    expect(tokens).toEqual(before);
  });

  it('leaves an absent logoURL/customCSS absent rather than adding an undefined key', () => {
    const tokens = { cssVariables: {} };
    const mapped = mapStyleTokenAssets(tokens, toAssetRef);
    expect('logoURL' in mapped).toBe(false);
    expect('customCSS' in mapped).toBe(false);
  });
});

describe('mapDefinitionAssets', () => {
  it('maps every asset field across welcome/end screens, style tokens and picture-choice options', () => {
    const def = definition();
    const before = structuredClone(def);
    const mapped = mapDefinitionAssets(def, toAssetRef);

    expect(mapped.welcomeScreen?.mediaURL).toBe(`/forms/asset/${ID}`);
    expect(mapped.endScreens[0]?.mediaURL).toBe(`/forms/asset/${ID}`);
    expect('mediaURL' in mapped.endScreens[1]).toBe(false);
    expect(mapped.pages[0]?.questions[0]?.options[0]?.imageURL).toBe(`/forms/asset/${ID}`);
    expect('imageURL' in (mapped.pages[0]?.questions[0]?.options[1] ?? {})).toBe(false);
    expect(mapped.styleTokens.logoURL).toBe(`/forms/asset/${ID}`);
    expect(mapped.styleTokens.cssVariables['--mj-brand-primary']).toBe('#123456');

    // Input must never be mutated.
    expect(def).toEqual(before);
  });
});
