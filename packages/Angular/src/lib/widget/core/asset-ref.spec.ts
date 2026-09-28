import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import {
  apiBaseOf,
  collectLaterImageUrls,
  mapCssUrls,
  mapDefinitionAssets,
  mapStyleTokenAssets,
  resolveAssetUrl,
  resolveDefinitionForRender,
  resolveStyleTokensForRender,
  toAssetRef,
} from './asset-ref';

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

  it('recognises the route under ANY path prefix (MJAPI deployed behind e.g. /api)', () => {
    expect(toAssetRef(`https://h/api/forms/asset/${ID}`)).toBe(`/forms/asset/${ID}`);
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

  it('does not recognise a route that merely ENDS in "forms/asset" (/xforms/asset/<id>)', () => {
    // The suffix match is anchored on the `/` before `forms`, so a lookalike segment is not ours.
    expect(toAssetRef(`/xforms/asset/${ID}`)).toBe(`/xforms/asset/${ID}`);
    expect(toAssetRef(`https://h/xforms/asset/${ID}`)).toBe(`https://h/xforms/asset/${ID}`);
  });
});

describe('resolveAssetUrl', () => {
  it('makes a relative asset reference absolute on the given API base', () => {
    expect(resolveAssetUrl(`/forms/asset/${ID}`, 'https://api.example.com')).toBe(
      `https://api.example.com/forms/asset/${ID}`,
    );
  });

  it('rewrites a legacy absolute asset URL to a different API base', () => {
    expect(resolveAssetUrl(`http://localhost:4000/forms/asset/${ID}`, 'https://api.example.com')).toBe(
      `https://api.example.com/forms/asset/${ID}`,
    );
  });

  it('returns the value unchanged when apiBase is empty', () => {
    expect(resolveAssetUrl(`/forms/asset/${ID}`, '')).toBe(`/forms/asset/${ID}`);
  });

  it('returns a legacy absolute asset URL unchanged when apiBase is empty', () => {
    expect(resolveAssetUrl(`http://localhost:4000/forms/asset/${ID}`, '')).toBe(
      `http://localhost:4000/forms/asset/${ID}`,
    );
  });

  it('tolerates a trailing slash on the API base', () => {
    expect(resolveAssetUrl(`/forms/asset/${ID}`, 'https://api.example.com/')).toBe(
      `https://api.example.com/forms/asset/${ID}`,
    );
  });

  it('includes a path prefix carried by the API base (MJAPI behind e.g. /api)', () => {
    expect(resolveAssetUrl(`/forms/asset/${ID}`, 'https://h/api')).toBe(`https://h/api/forms/asset/${ID}`);
  });

  it('leaves an external URL unchanged regardless of API base', () => {
    expect(resolveAssetUrl('https://cdn.example.com/logo.png', 'https://api.example.com')).toBe(
      'https://cdn.example.com/logo.png',
    );
  });
});

describe('apiBaseOf', () => {
  it('is the bare origin for a root-only host, no trailing slash', () => {
    expect(apiBaseOf('http://localhost:4131')).toBe('http://localhost:4131');
  });

  it('tolerates a trailing slash on a root-only host', () => {
    expect(apiBaseOf('http://localhost:4131/')).toBe('http://localhost:4131');
  });

  it('drops a bare /graphql path', () => {
    expect(apiBaseOf('https://h/graphql')).toBe('https://h');
  });

  it('keeps a path prefix in front of /graphql', () => {
    expect(apiBaseOf('https://h/api/graphql')).toBe('https://h/api');
  });

  it('keeps a path prefix with no /graphql suffix, dropping its trailing slash', () => {
    expect(apiBaseOf('https://h/api/')).toBe('https://h/api');
  });

  it('keeps a bare /api path DELIBERATELY: Forms routes live at the api-url minus /graphql, no more', () => {
    // Pins the reverse-proxy model shared with `deriveUploadUrl`: a prefix in MJAPI_PUBLIC_URL is
    // where MJAPI (and so every /forms/* route) lives. A GRAPHQL_ROOT_PATH of `/api` would NOT be —
    // MJServer moves only GraphQL there — and is unsupported; the server warns about it at boot.
    expect(apiBaseOf('https://h/api')).toBe('https://h/api');
  });

  it('returns empty for an empty string', () => {
    expect(apiBaseOf('')).toBe('');
  });

  it('returns empty for a relative path', () => {
    expect(apiBaseOf('/graphql')).toBe('');
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
  it('leaves a non-string asset field untouched rather than throwing (stored JSON is untyped)', () => {
    // The one legitimate cast: fabricating the corrupt stored JSON a typed caller cannot produce.
    const def = definition();
    const corrupt = {
      ...def,
      welcomeScreen: { ...def.welcomeScreen!, mediaURL: 42 as unknown as string },
      styleTokens: {
        cssVariables: { '--mjf-x': 7 as unknown as string },
        customCSS: 9 as unknown as string,
        logoURL: 5 as unknown as string,
      },
    };
    const mapped = mapDefinitionAssets(corrupt, toAssetRef);

    expect(mapped.welcomeScreen?.mediaURL).toBe(42);
    expect(mapped.styleTokens.cssVariables['--mjf-x']).toBe(7);
    expect(mapped.styleTokens.customCSS).toBe(9);
    expect(mapped.styleTokens.logoURL).toBe(5);
    expect(resolveDefinitionForRender(corrupt, 'https://h/graphql').welcomeScreen?.mediaURL).toBe(42);
  });

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

  it('leaves welcomeScreen absent rather than adding an undefined key when the form has none', () => {
    const def = definition();
    delete def.welcomeScreen;
    const mapped = mapDefinitionAssets(def, toAssetRef);
    expect('welcomeScreen' in mapped).toBe(false);
  });
});

describe('resolveDefinitionForRender', () => {
  it('resolves every asset reference against the origin of the given graphqlUrl', () => {
    const def = definition();
    const resolved = resolveDefinitionForRender(def, 'http://localhost:4131');
    expect(resolved.welcomeScreen?.mediaURL).toBe(`http://localhost:4131/forms/asset/${ID}`);
    expect(resolved.pages[0]?.questions[0]?.options[0]?.imageURL).toBe(`http://localhost:4131/forms/asset/${ID}`);
  });

  it('resolves against the API base, including a path prefix, of a prefixed graphql endpoint URL', () => {
    const def = definition();
    const resolved = resolveDefinitionForRender(def, 'https://h/api/graphql');
    expect(resolved.welcomeScreen?.mediaURL).toBe(`https://h/api/forms/asset/${ID}`);
  });

  it('tolerates a graphqlUrl with a trailing slash', () => {
    const def = definition();
    const resolved = resolveDefinitionForRender(def, 'http://localhost:4131/');
    expect(resolved.welcomeScreen?.mediaURL).toBe(`http://localhost:4131/forms/asset/${ID}`);
  });

  it('resolves against the origin of a full graphql endpoint URL', () => {
    const def = definition();
    const resolved = resolveDefinitionForRender(def, 'https://h/graphql');
    expect(resolved.welcomeScreen?.mediaURL).toBe(`https://h/forms/asset/${ID}`);
  });

  it('leaves asset references unchanged when graphqlUrl is empty', () => {
    const def = definition();
    const resolved = resolveDefinitionForRender(def, '');
    expect(resolved.welcomeScreen?.mediaURL).toBe(`http://old/forms/asset/${ID}`);
  });
});

describe('resolveStyleTokensForRender', () => {
  it('resolves style-token asset references against the origin of the given graphqlUrl', () => {
    const tokens = definition().styleTokens;
    const resolved = resolveStyleTokensForRender(tokens, 'http://localhost:4131');
    expect(resolved.logoURL).toBe(`http://localhost:4131/forms/asset/${ID}`);
  });

  it('leaves style-token asset references unchanged when graphqlUrl is empty', () => {
    const tokens = definition().styleTokens;
    const resolved = resolveStyleTokensForRender(tokens, '');
    expect(resolved.logoURL).toBe(`http://old/forms/asset/${ID}`);
  });
});

describe('collectLaterImageUrls', () => {
  const opt = (id: string, displayOrder: number, imageURL?: string) => ({
    id,
    label: id,
    value: id,
    displayOrder,
    ...(imageURL ? { imageURL } : {}),
  });
  const question = (id: string, displayOrder: number, options: ReturnType<typeof opt>[]) => ({
    id,
    type: 'PictureChoice' as const,
    prompt: id,
    isRequired: false,
    displayOrder,
    options,
  });
  const screen = (id: string, screenType: 'Welcome' | 'Ending', displayOrder: number, mediaURL?: string) => ({
    id,
    screenType,
    title: id,
    displayOrder,
    ...(mediaURL ? { mediaURL } : {}),
  });
  const base = (over: Partial<PublishedFormDefinition>): PublishedFormDefinition =>
    ({
      formId: 'f',
      formVersionId: 'v',
      name: 'n',
      renderMode: 'Scroll',
      settings: {},
      styleTokens: { cssVariables: {} },
      pages: [],
      endScreens: [],
      ...over,
    }) as PublishedFormDefinition;

  it('lists option images, then ending images, in the order the respondent meets them', () => {
    const def = base({
      // Pages/questions/endings are stored out of order on purpose: the renderer sorts them by displayOrder,
      // so the prefetch does too. Options are in published array order (no sort), like form-question.component.html.
      pages: [
        { id: 'p2', displayOrder: 1, questions: [question('q3', 0, [opt('e', 0, '/img/e')])] },
        {
          id: 'p1',
          displayOrder: 0,
          questions: [
            question('q2', 1, [opt('d', 0, '/img/d')]),
            question('q1', 0, [opt('b', 1, '/img/b'), opt('a', 0, '/img/a')]),
          ],
        },
      ],
      endScreens: [screen('end2', 'Ending', 1, '/img/end2'), screen('end1', 'Ending', 0, '/img/end1')],
    });
    expect(collectLaterImageUrls(def)).toEqual(['/img/b', '/img/a', '/img/d', '/img/e', '/img/end1', '/img/end2']);
  });

  it('leaves out the welcome image, the logo and CSS assets: the first screen loads those itself', () => {
    const def = base({
      welcomeScreen: screen('w', 'Welcome', 0, '/img/welcome'),
      styleTokens: { cssVariables: { '--mjf-page-bg-image': 'url(/img/bg)' }, logoURL: '/img/logo' },
      endScreens: [screen('end', 'Ending', 0, '/img/end')],
    });
    expect(collectLaterImageUrls(def)).toEqual(['/img/end']);
  });

  it('drops duplicates, keeping the first place an image is needed', () => {
    const def = base({
      pages: [{ id: 'p', displayOrder: 0, questions: [question('q', 0, [opt('a', 0, '/img/same'), opt('b', 1, '/img/same')])] }],
      endScreens: [screen('end', 'Ending', 0, '/img/same')],
    });
    expect(collectLaterImageUrls(def)).toEqual(['/img/same']);
  });

  it('skips options and endings without an image, and returns [] for a form with none', () => {
    const def = base({
      pages: [{ id: 'p', displayOrder: 0, questions: [question('q', 0, [opt('a', 0)])] }],
      endScreens: [screen('end', 'Ending', 0)],
    });
    expect(collectLaterImageUrls(def)).toEqual([]);
    expect(collectLaterImageUrls(base({}))).toEqual([]);
  });
});
