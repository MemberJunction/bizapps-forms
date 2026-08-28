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

/** Everything above the tab strip — the publish control and nothing else. */
const header = (): string => {
  const html = template();
  const end = html.indexOf('<nav class="fb-tabs"');
  expect(end).toBeGreaterThan(0);
  return html.slice(0, end);
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
    expect(html).toContain('@let reach = publishReach;');
    expect(html).toContain('reach.label');
    expect(html).toContain('reach.detail');
  });

  it('offers the way out rather than only naming it', () => {
    // `needsAttention` is true exactly when there is something to do on the Distribute tab.
    // A status that reports a problem and leaves you to find the tab is half a message.
    const html = header();
    expect(html).toContain('reach.needsAttention');
    expect(html).toMatch(/needsAttention[\s\S]{0,400}?setTab\('distribute'\)/);
  });
});

describe('the reach the header renders', () => {
  it('is read from the database, never inferred from Form.Status', () => {
    const source = component();
    expect(source).toMatch(/formReach\(/);
    expect(source).toMatch(/shareLinkFacts\(/);
  });

  it('survives a failed read as "unknown" rather than as "no links"', () => {
    // `shareLinkFacts` returns null when the RunView fails, and null is a distinct kind.
    // Seeding the field with `[]` would make an unreadable list argue for a second link.
    expect(component()).toMatch(/shareLinks: ShareLinkFacts\[\] \| null = null/);
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
