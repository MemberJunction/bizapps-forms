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

  it('the screen image no longer reports load/error — the welcome gate owns that (#291)', () => {
    expect(screen).not.toContain('(load)=');
    expect(screen).not.toContain('(error)=');
  });
});

describe('prefetch lifecycle — source smoke', () => {
  it('load() cancels the previous queue before anything else can start one', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load).toContain('this.cancelPrefetch()');
    expect(load.indexOf('this.cancelPrefetch()')).toBeLessThan(load.indexOf('this.planPrefetch(def, opening, gated)'));
  });

  it('ngOnDestroy cancels the queue', () => {
    expect(body(form, 'public ngOnDestroy(): void')).toContain('this.cancelPrefetch()');
  });

  it('a load() that resumes after destroy cannot start a queue', () => {
    const destroy = body(form, 'public ngOnDestroy(): void');
    expect(destroy).toContain('this.destroyed = true');
    expect(destroy.indexOf('this.destroyed = true')).toBeLessThan(destroy.indexOf('this.cancelPrefetch()'));
    expect(body(form, 'private startPrefetch(): void')).toContain('this.destroyed ||');
  });

  it('plans nothing unless intake is still ahead (welcome or ready)', () => {
    const plan = body(form, 'private planPrefetch(def: PublishedFormDefinition, opening: WidgetPhase, gated: boolean): void');
    expect(plan).toContain(`opening !== 'welcome' && opening !== 'ready'`);
    expect(plan.indexOf(`opening !== 'welcome' && opening !== 'ready'`)).toBeLessThan(
      plan.indexOf('this.schedulePrefetchWhenIdle()'),
    );
  });

  it('leaving the welcome screen early still starts the prefetch', () => {
    expect(body(form, 'protected startIntake(): void')).toContain('this.startPrefetch()');
  });

  it('starts at most once per load', () => {
    const start = body(form, 'private startPrefetch(): void');
    expect(start).toContain('this.prefetchStarted)');
    expect(start).toContain('this.prefetchStarted = true');
  });

  it('a stale idle callback from an earlier load cannot start a queue', () => {
    const schedule = body(form, 'private schedulePrefetchWhenIdle(): void');
    expect(schedule).toContain('const generation = this.prefetchGeneration');
    expect(schedule).toContain('generation === this.prefetchGeneration');
    expect(body(form, 'private cancelPrefetch(): void')).toContain('this.prefetchGeneration++');
  });
});

describe('welcome gate wiring — source smoke (#291)', () => {
  it('an author command ends the gate wait, so the logo is not hidden above the chosen screen', () => {
    const show = body(form, 'public showScreen(selection: ShownScreen): void');
    expect(show).toContain('this.waitingForWelcomeImage.set(false)');
  });
  it('plans the prefetch before holding, so prefetchUrls is set before anything can start the queue', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load.indexOf('this.planPrefetch(')).toBeLessThan(load.indexOf('this.holdForWelcomeImages('));
  });
  it('gates only a load that opens on a welcome screen with an image', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load).toMatch(/opening === 'welcome' \? def\.welcomeScreen\?\.mediaURL/);
    expect(load).toContain('this.holdForWelcomeImages(');
  });
  it('every load starts a new generation and clears the wait', () => {
    const load = body(form, 'private async load(): Promise<void>');
    expect(load).toContain('this.loadGeneration++');
    expect(load).toContain('this.waitingForWelcomeImage.set(false)');
  });
  it('the gate is current only for this load and a live widget, and never overrides an author command', () => {
    const hold = body(form, 'private holdForWelcomeImages(welcomeImage: string): void');
    expect(hold).toContain('!this.destroyed && generation === this.loadGeneration');
    expect(hold).toContain("if (this.phase() === 'loading') this.phase.set('welcome')");
    expect(hold).toContain('imagesSettled: () => this.startPrefetch()');
  });
  it('the MJ loader shows only while waiting for the welcome images; the neutral spinner otherwise', () => {
    expect(html).toMatch(/@if \(waitingForWelcomeImage\(\)\) \{\s*<mjf-mj-loader \/>\s*\} @else \{\s*<span class="mjf-spinner"/);
  });
  it('the logo bar stays hidden while the gate waits, so it arrives with the welcome screen', () => {
    expect(html).toContain('@if (shownLogoUrl(); as logo)');
  });
});
