import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SOURCE-PRESENCE SMOKE for the prefetch lifecycle. These components cannot be instantiated in the
 * node test environment, so this guards the seams a refactor could silently drop:
 * - a queue that is never started;
 * - one started twice;
 * - one left running after the form reloads;
 * - a welcome image that loses its head start.
 * The queue's behaviour is covered in `core/image-prefetch.spec.ts`.
 */
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (file: string): string => strip(readFileSync(join(__dirname, file), 'utf8'));
const screen = read('components/form-screen.component.ts');
const form = read('mj-form.component.ts');
const html = readFileSync(join(__dirname, 'mj-form.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/** The body of a method, from its signature to the next method-level closing brace. */
function body(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }\n', start);
  return source.slice(start, end);
}

describe('welcome image priority — source smoke', () => {
  it('asks for high priority only on the welcome screen', () => {
    expect(screen).toContain(`[attr.fetchpriority]="isWelcome() ? 'high' : null"`);
  });

  it('reports the image settling on load AND on error, so a broken image still releases the queue', () => {
    expect(screen).toContain('(load)="mediaSettled.emit()"');
    expect(screen).toContain('(error)="mediaSettled.emit()"');
    expect(screen).toContain('public readonly mediaSettled = output<void>()');
  });
});

describe('prefetch lifecycle — source smoke', () => {
  it('the welcome case starts the prefetch when its image settles', () => {
    expect(html).toContain('(mediaSettled)="onWelcomeMediaSettled()"');
  });

  it('load() cancels the previous queue before anything else can start one', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load).toContain('this.cancelPrefetch()');
    expect(load.indexOf('this.cancelPrefetch()')).toBeLessThan(load.indexOf('this.planPrefetch(def)'));
  });

  it('ngOnDestroy cancels the queue', () => {
    expect(body(form, 'public ngOnDestroy(): void')).toContain('this.cancelPrefetch()');
  });

  it('leaving the welcome screen early still starts the prefetch', () => {
    expect(body(form, 'protected startIntake(): void')).toContain('this.startPrefetch()');
  });

  it('starts at most once per load', () => {
    const start = body(form, 'private startPrefetch(): void');
    expect(start).toContain('if (this.prefetchStarted)');
    expect(start).toContain('this.prefetchStarted = true');
  });

  it('a stale idle callback from an earlier load cannot start a queue', () => {
    const schedule = body(form, 'private schedulePrefetchWhenIdle(): void');
    expect(schedule).toContain('const generation = this.prefetchGeneration');
    expect(schedule).toContain('generation === this.prefetchGeneration');
    expect(body(form, 'private cancelPrefetch(): void')).toContain('this.prefetchGeneration++');
  });
});
