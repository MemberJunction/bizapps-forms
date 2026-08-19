import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guards for the Distribute tab.
 *
 * These read source text rather than exercising the component: it cannot be instantiated
 * in the vitest node env (no Angular JIT), and what is being guarded is not behaviour a
 * DOM-free component test would reach anyway — it is a set of design decisions that a
 * later edit could quietly undo while every other test stayed green.
 *
 * Source-text assertions are weak evidence and worth only what their subject is worth. The
 * two here are worth it because both failure modes have already happened once: gating an
 * artifact on `ChannelType` is the defect this redesign exists to remove, and showing a
 * raw `Status` is the defect that let a link at its response cap advertise itself as
 * "Active". The real behaviour lives in `share-state.spec.ts`, which tests the logic.
 */
const here = __dirname;
const source = (file: string): string => readFileSync(join(here, file), 'utf8');

/** Strip HTML comments — they discuss both banned patterns at length by name. */
const withoutComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '');

const template = withoutComments(source('distribution-manager.component.html'));

describe('the Distribute template', () => {
  it('never decides what to show from the channel', () => {
    // The whole point. A link is a link; QR and embed are renderings of it. The moment a
    // branch reads ChannelType, "create a second link to get a QR of the first" is back.
    expect(template).not.toMatch(/ChannelType/);
  });

  it('offers all three ways to share, for every link', () => {
    for (const view of ["view = 'link'", "view = 'qr'", "view = 'embed'"]) {
      expect(template).toContain(view);
    }
  });

  it('badges the effective state rather than the Status column', () => {
    // `state.label` comes from shareState(); `link.Status` is the column that lies.
    expect(template).toContain('{{ state.label }}');
    expect(template).not.toMatch(/\{\{\s*link\.Status\s*\}\}/);
  });

  it('reads Status only to draw the open switch, where it is the actual control', () => {
    const statusReads = template.match(/link\.Status/g) ?? [];
    // Exactly two, both on the switch itself: its `is-on` class and its `aria-checked`.
    // Anything beyond that is a display decision being made from the column again.
    expect(statusReads).toHaveLength(2);
  });

  it('shows a failed load as a failure, never as an empty list', () => {
    // `[]` on error plus an inviting empty state tells someone with live links in the wild
    // that they have none, and invites them to make a duplicate.
    const loadErrorAt = template.indexOf('loadError');
    const emptyAt = template.indexOf('links.length === 0');
    expect(loadErrorAt).toBeGreaterThanOrEqual(0);
    expect(emptyAt).toBeGreaterThan(loadErrorAt);
    expect(template).toContain('@else if (links.length === 0)');
  });

  it('keeps the QR plate dark-on-light in both themes', () => {
    // Themed with --mj-text-primary on --mj-bg-surface, the code inverts in dark mode and
    // a good many scanners refuse it.
    const styles = source('distribution-manager.styles.ts');
    expect(styles).toContain('--mjf-qr-dark');
    expect(styles).toContain('--mjf-qr-light');
  });
});

describe('the Distribute component', () => {
  const component = source('distribution-manager.component.ts');

  it('writes through the service, never through the entity directly', () => {
    // Every write has to go where the failure message is turned into something showable.
    expect(component).not.toMatch(/\.Save\(\)/);
    expect(component).not.toMatch(/\.Delete\(\)/);
  });

  it('asks for nothing when creating a link', () => {
    // A blank required field between a person and the only artifact this tab produces.
    expect(component).not.toMatch(/createBlockedReason/);
    expect(component).toContain('autoShareName');
  });

  it('handles every state kind in the fix switch', () => {
    // A missing branch is a button that renders and then does nothing when pressed.
    for (const kind of ['pending', 'paused', 'ended', 'scheduled', 'full', 'live']) {
      expect(component, `applyFix has no branch for ${kind}`).toContain(`case '${kind}':`);
    }
  });

  it('forces the save when asking the server to issue a link', () => {
    // Save() skips a clean record entirely, and the records needing a link are usually
    // already Active — so without this the button is a no-op exactly when it matters.
    expect(source('distribution.service.ts')).toContain('IgnoreDirtyState = true');
  });

  it('puts the record back when a save is refused', () => {
    // The database bounced a too-large limit and the box kept displaying it, because the
    // rejected value stays on the in-memory record that the template renders from.
    // Cannot be reached from the node env (the service constructs a Metadata provider at
    // field-initialiser time), so this guards the call and the browser check covers the rest.
    expect(source('distribution.service.ts')).toContain('dist.Revert()');
  });

  it('never writes a limit straight from the input', () => {
    // Number('') is 0 and Number('-5') is -5; both were written verbatim, meaning an empty
    // box capped at zero and a typo uncapped a live link.
    expect(component).toContain('readResponseLimit');
    expect(component).not.toMatch(/setMaxResponses\(link,\s*Number\(/);
  });

  it('clears the copy-confirmation timer when it goes away', () => {
    expect(component).toContain('ngOnDestroy');
    expect(component).toContain('clearTimeout');
  });
});
