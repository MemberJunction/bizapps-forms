import { describe, it, expect } from 'vitest';

import { ELEMENT_ATTRIBUTES, configFromAttributes, effectOf } from './element-attributes';

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

  it('ignores an attribute nobody declared', () => {
    expect(effectOf('data-whatever')).toBeUndefined();
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
