import { describe, it, expect } from 'vitest';

import { ELEMENT_ATTRIBUTES, configFromAttributes, effectOf, inputsFromAttributes } from './element-attributes';

describe('element attribute contract', () => {
  it('acts on every attribute it declares it observes', () => {
    // The bug this pins: `api-url`, `token` and `turnstile-site-key` were declared in
    // observedAttributes and then silently ignored by attributeChangedCallback.
    for (const name of ELEMENT_ATTRIBUTES) {
      expect(effectOf(name), `no effect declared for "${name}"`).toBeDefined();
    }
  });

  it('treats a connection attribute as needing the transport rebuilt', () => {
    expect(effectOf('api-url')).toBe('rebuild');
    expect(effectOf('token')).toBe('rebuild');
    expect(effectOf('turnstile-site-key')).toBe('rebuild');
  });

  it('treats the slug as a plain input, since the transport does not change', () => {
    expect(effectOf('slug')).toBe('input');
  });

  it('treats the resume notice as a plain input, since the transport does not change', () => {
    // The /f/:slug host page sets `resume-notice` before appending the element. With no row
    // here the element never observed it and never read it, so a respondent whose saved draft
    // could not be reopened was never told.
    expect(effectOf('resume-notice')).toBe('input');
  });

  it('ignores an attribute nobody declared', () => {
    expect(effectOf('data-whatever')).toBeUndefined();
  });
});

describe('inputsFromAttributes', () => {
  it('hands every input attribute to the component under its own name', () => {
    const inputs = inputsFromAttributes((n) =>
      ({ slug: 'apply', 'resume-notice': "We couldn't reopen your saved answers." })[n] ?? null,
    );

    expect(inputs).toEqual([
      ['slug', 'apply'],
      ['resume-notice', "We couldn't reopen your saved answers."],
    ]);
  });

  it('passes an absent input attribute as empty, which is each input’s own default', () => {
    expect(inputsFromAttributes(() => null)).toEqual([
      ['slug', ''],
      ['resume-notice', ''],
    ]);
  });

  it('never hands a connection attribute to the component — those rebuild the transport', () => {
    const names = inputsFromAttributes(() => 'x').map(([name]) => name);

    expect(names).not.toContain('api-url');
    expect(names).not.toContain('token');
    expect(names).not.toContain('turnstile-site-key');
  });
});

describe('configFromAttributes', () => {
  it('reads the connection off the element', () => {
    const config = configFromAttributes((n) =>
      ({ 'api-url': 'https://api.example.com/graphql', token: 'abc' })[n] ?? null,
    );

    expect(config.graphqlUrl).toBe('https://api.example.com/graphql');
    expect(config.token).toBe('abc');
  });

  it('leaves graphqlUrl empty when unset, which is what selects the mock transport', () => {
    expect(configFromAttributes(() => null).graphqlUrl).toBe('');
  });
});
