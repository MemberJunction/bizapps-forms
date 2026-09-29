import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SOURCE-PRESENCE SMOKE for the `<mj-form>` rebuild. The element class extends `HTMLElement`, which
 * does not exist in this node test environment, so its wiring is pinned by reading the source; the
 * placement logic itself is covered by `element-host.spec.ts`.
 *
 * The defect this guards: a `rebuild` attribute (`api-url`, `token`, `turnstile-site-key`) changed on a
 * mounted element tore the old application down with the element still in the page. Destroying a
 * component whose host is the element detaches that host from the DOM, so the element removed
 * itself, `disconnectedCallback` re-entered teardown, and the `isConnected` check after
 * `createApplication` abandoned the rebuild. The form vanished instead of reconnecting.
 */
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const source = strip(readFileSync(join(__dirname, 'register-element.ts'), 'utf8'));

/** The body of a method, from its signature to the next method-level closing brace. */
function body(signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }\n', start);
  expect(end, `end of ${signature} not found`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('<mj-form> rebuild — source smoke', () => {
  it('a rebuild tears down with the element kept in place, under the rebuilding flag', () => {
    const mount = body('private async mount(): Promise<void>');
    expect(mount).toContain('this.teardownInPlace()');
    expect(mount).not.toMatch(/this\.teardown\(\);/);
    const inPlace = body('private teardownInPlace(): void');
    expect(inPlace).toContain('this.rebuilding = true');
    expect(inPlace).toContain('keepInPlace(this, () => this.teardown())');
    expect(inPlace).toMatch(/finally \{\s*this\.rebuilding = false;/);
  });

  it('ignores the detach and reattach the rebuild itself causes', () => {
    expect(body('public disconnectedCallback(): void')).toMatch(/if \(this\.rebuilding\) \{\s*return;/);
    expect(body('public connectedCallback(): void')).toMatch(/if \(this\.rebuilding\) \{\s*return;/);
  });
});
