/**
 * Structural guards for the one claim the builder header is least entitled to make.
 *
 * ISSUE #83. The header's Published chip carried a fixed sentence — "Everything in this form
 * is live on its public link" — hung off `Form.Status` alone. Publishing writes a
 * `FormVersion`; it does not write a `FormDistribution`, and without one of those there is no
 * URL for anything to be live on. So a form published five seconds ago, with the Distribute
 * tab still showing "Share this form … Create a share link" one click away, told its author it
 * was reachable by the public. It was reachable by nobody.
 *
 * The behaviour lives in `formReach` and is tested in `share-state.spec.ts`. What is guarded
 * here is that the header actually ASKS — the defect was never in the logic, it was a
 * hardcoded sentence in a template, and a hardcoded sentence is exactly what a later edit
 * could put back with every logic test still green.
 *
 * Source text rather than a rendered component: the builder uses decorated inputs and cannot
 * be instantiated in this suite's node environment (see `distribution-manager.spec.ts`, same
 * constraint, same trade). Comments are stripped before every assertion, because this file's
 * subject is discussed at length in the prose of the very files it inspects.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripped = (file: string): string =>
  readFileSync(join(__dirname, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

const template = (): string => stripped('form-builder.component.html');
const component = (): string => stripped('form-builder.component.ts');

/** Everything above the tab strip. Holds the publish control and its neighbours. */
const header = (): string => {
  const html = template();
  const end = html.indexOf('<nav class="fb-tabs"');
  expect(end).toBeGreaterThan(0);
  return html.slice(0, end);
};

/** Just the publish control's own region, so a guard about it cannot be met by a sibling. */
const publishControl = (): string => {
  const html = header();
  const start = html.indexOf('<div class="fb-publish-status"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start);
};

describe('the builder header on a published form', () => {
  it('never promises a public link in words the template chose for itself', () => {
    // The whole bug in one assertion. Any literal "public link" in this header is a claim
    // made without looking at FormDistribution, whichever of the three publish states it
    // sits in — "Publish this form to make its public link live" was the same lie one state
    // earlier, told to a form that publishing alone would not make reachable either.
    expect(header()).not.toMatch(/public link/i);
  });

  it('takes its wording from the reach of the actual share links', () => {
    const html = header();
    expect(html).toMatch(/@let\s+reach\s*=\s*publishReach/);
    expect(html).toMatch(/reach\.label/);
    expect(html).toMatch(/reach\.detail/);
  });

  it('offers the way out rather than only naming it', () => {
    // Every unreachable state has somewhere to go, including the one where the links could not
    // be read: the Distribute tab is where that failure is explained. A status that reports a
    // problem and leaves you to find the tab is half a message.
    const html = header();
    expect(html).toMatch(/reach\.reachable/);
    expect(html).toMatch(/reachable[\s\S]{0,900}?setTab\('distribute'\)/);
  });

  it('does not put the instruction behind a hover', () => {
    // The mobile-first bar. `title` is the one attribute a touch screen cannot show, so the
    // sentence has to reach a screen reader some other way too.
    expect(header()).toMatch(/aria-label\]?="reach\.detail"/);
  });

  it('announces from a region that outlives the state it announces', () => {
    // A live region inserted with its content already in it is announced by nothing. The
    // states here replace one another, so the role has to sit on the wrapper that stays.
    const control = publishControl();
    expect(control).toMatch(/^<div class="fb-publish-status"[^>]*role="status"[^>]*aria-live/);
    // And exactly once: a nested second status region is its own announcement bug.
    expect(control.match(/role="status"/g) ?? []).toHaveLength(1);
  });
});

describe('the reach the header renders', () => {
  it('is read from the database, never inferred from Form.Status', () => {
    const source = component();
    expect(source).toMatch(/formReach\(/);
    expect(source).toMatch(/shareLinkFacts\(/);
  });

  it('survives a failed read as "unknown" rather than as "no links"', () => {
    // `shareLinkFacts` returns null when the RunView fails, and null is a distinct kind
    // (`share-state.spec.ts` tests what it then says). What is guarded here is the seed:
    // starting the field at `[]` would have an unread list argue for a second share link,
    // and go on arguing for one forever if the read failed.
    const source = component();
    expect(source).toMatch(/shareLinks[^;=]*=\s*null/);
    expect(source).not.toMatch(/shareLinks[^;=]*=\s*\[\]/);
  });

  it('re-reads when a share link is written anywhere else in the app', () => {
    // The builder stays mounted while its tabs change, so the Distribute tab creating the
    // first link would otherwise leave the header insisting the form is not shared — the
    // inverse of #83 and just as wrong. Same MJGlobal entity-event seam the automations use.
    const source = component();
    expect(source).toMatch(/FORMS_ENTITY\.FormDistribution/);
    expect(source).toMatch(/distributionChanges/);
    // A listener that outlives the component keeps re-reading for a form nobody is looking at.
    expect(source).toMatch(/distributionChanges\?\.unsubscribe\(\)/);
  });
});
