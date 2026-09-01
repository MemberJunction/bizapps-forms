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
 * Source-text assertions are weak evidence and worth only what their subject is worth.
 * Each one here guards a decision whose failure mode has already happened, or would be
 * silent: gating an artifact on `ChannelType` is the defect this redesign exists to
 * remove; showing a raw `Status` is what let a link at its response cap advertise itself
 * as "Active"; and skipping the re-read after a credential write puts a revoked token on
 * screen. They match loosely — on the call or the attribute, not on formatting — so a
 * reflow cannot red them. The real behaviour lives in `share-state.spec.ts`, which tests
 * the logic.
 */
const here = __dirname;
const source = (file: string): string => readFileSync(join(here, file), 'utf8');

/** Strip HTML comments — they discuss both banned patterns at length by name. */
const withoutComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '');

const template = withoutComments(source('distribution-manager.component.html'));

/**
 * The component's source with comments stripped. These guards are about CODE, and this
 * component's prose names the server methods (`FormDistributionEntityServer.Save()`) whose
 * absence some of them check for — an unstripped read makes the doc comment fail the test.
 */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

const component = stripComments(source('distribution-manager.component.ts'));

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

  it('never reads the Status column, not even for the open switch', () => {
    // This test used to allow exactly two reads — the switch's `is-on` and `aria-checked` —
    // on the reasoning that Status "is the actual control" there. It is not. "Open to
    // responses" is `Status='Active'` AND `IsActive`, which is what the server requires
    // before it warrants a credential and what `openForResponses` writes. So the two
    // permitted reads were the same display-from-the-column defect as all the others, and
    // this test was holding them in place: the switch drew ON for a paused link and its
    // handler then closed it. The allowance is gone; the control asks `isOpen(link)`.
    expect(template.match(/link\.Status/g) ?? []).toHaveLength(0);
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

  it('confirms before reissuing, confirm left and cancel right', () => {
    // Irreversible: the previous token stops working the instant it lands.
    expect(template).toContain('confirmingReissue');
    const confirmAt = template.indexOf('confirmReissue()');
    const cancelAt = template.indexOf('confirmingReissue = false');
    expect(confirmAt).toBeGreaterThanOrEqual(0);
    expect(cancelAt).toBeGreaterThan(confirmAt);
  });

  it('asks the service to reissue, never clearing the token itself', () => {
    // Clearing the columns from here would leave the OLD invite Active and unreferenced —
    // the orphaned-credential defect. The server hook is the only thing that revokes.
    expect(component).toContain('service.reissueLink');
    // `=[^=]`, not a bare `=`: this bans ASSIGNMENT, and the component is explicitly allowed to
    // READ these columns (the Reissue block is gated on `link.PublicLinkToken`). A bare `=` also
    // matches `==`/`===`, so a future `if (link.PublicLinkToken === null)` would red a test about
    // writing. The sibling guard below already had this right; the two now agree.
    expect(component).not.toMatch(/PublicLinkToken\s*=[^=]/);
    expect(component).not.toMatch(/MagicLinkInviteID\s*=[^=]/);
  });

  it('re-reads the record after every write that changes the token', () => {
    // Pause / reopen / issue / reissue each make the server write the credential in a
    // SECOND save this client never sees. Without the re-read the screen renders a token
    // that has been revoked, or none where one was just minted.
    //
    // Matched loosely on purpose — the point is which service call sits inside
    // runCredentialWrite, not how the line happens to be wrapped.
    for (const call of ['issueLink', 'open', 'close', 'reissueLink']) {
      expect(
        component,
        `service.${call} is not routed through the reloading path`,
      ).toMatch(new RegExp(String.raw`runCredentialWrite\([\s\S]{0,160}?service\.${call}\(`));
    }
  });

  it('offers Reissue only where there is a token to replace', () => {
    // On a paused or never-issued link there is nothing to reissue, and pressing it
    // would report that the old token was withdrawn and no new one arrived — false on
    // both counts.
    expect(template).toMatch(/@if \(link\.PublicLinkToken\)\s*\{/);
  });

  it('does not rename a button that already says what it does', () => {
    // aria-labelledby REPLACES the accessible name, so pointing the reissue buttons at
    // the "Access token" label would give two controls one name and drop their visible
    // text out of it (WCAG 2.5.3). The other uses here are on a switch, a number and a
    // date — controls with no text of their own.
    const labelled = template.match(/aria-labelledby="dm-[a-z]+-label"/g) ?? [];
    expect(labelled.sort()).toEqual([
      'aria-labelledby="dm-cap-label"',
      'aria-labelledby="dm-exp-label"',
      'aria-labelledby="dm-open-label"',
    ]);
  });
});

describe('the reissue request, where the builder must not do the server\'s job', () => {
  // Both comment-stripped, like the module-level bindings. Re-reading raw here (which this block
  // used to do) passes only for as long as no docstring happens to contain `dist.PublicLinkToken =`
  // — and these files discuss that exact assignment at length, so it was one comment away from
  // reddening four tests for no behavioural reason.
  const service = stripComments(source('distribution.service.ts'));
  const component = stripComments(source('distribution-manager.component.ts'));

  it('clears ONLY the token — never the invite id, which is what tells the server what to revoke', () => {
    // This is the one security-relevant line in the change, and it was guarded by reading the
    // COMPONENT — the file that deliberately never touches these columns — so the guard could
    // not see the service at all. Clearing `MagicLinkInviteID` here flips the server's verdict
    // from `reissue` (revoke, then mint) to `mint`: the old invite stays Active and redeemable,
    // referenced by no distribution, so no later save can ever find it to revoke. That is the
    // orphaned live credential the whole change exists to remove.
    const reissue = service.slice(service.indexOf('public async reissueLink'));
    const body = reissue.slice(0, reissue.indexOf('\n  }'));
    expect(body).toMatch(/PublicLinkToken\s*=\s*null/);
    expect(body).not.toMatch(/MagicLinkInviteID\s*=/);
  });

  it('leaves both credential columns alone everywhere else in the service', () => {
    const writes = service.match(/dist\.(?:MagicLinkInviteID|PublicLinkToken)\s*=/g) ?? [];
    // Exactly one: the reissue request above.
    expect(writes).toHaveLength(1);
  });

  it('never lets the component write a credential column itself', () => {
    expect(component).not.toMatch(/(?:MagicLinkInviteID|PublicLinkToken)\s*=[^=]/);
  });

  it('routes every selection change through the one helper that drops armed confirmations', () => {
    // A confirmation is armed against a RECORD; the flags holding it are not. Assigning
    // `selectedId` anywhere else let an armed "Replace it" survive onto whatever was selected
    // next, so one click rotated the token of a link the author never armed.
    const assignments = component.match(/this\.selectedId\s*=/g) ?? [];
    expect(assignments).toHaveLength(1);
    const helper = component.slice(component.indexOf('private selectLink('));
    expect(helper.slice(0, helper.indexOf('\n  }'))).toMatch(/confirmingReissue\s*=\s*false/);
  });

  it('re-reads the record QUIETLY after a credential write, so the pane is not unmounted', () => {
    const helper = component.slice(component.indexOf('private async runCredentialWrite('));
    expect(helper.slice(0, helper.indexOf('\n  }'))).toMatch(/this\.reload\(true\)/);
  });
});

describe('the "Open to responses" switch asks the whole question', () => {
  // `isOpenToResponses` is tested behaviourally in `share-state.spec.ts`. What cannot be
  // tested there is that the CONTROL asks it — the defect was never in the logic, it was
  // `Status === 'Active'` written straight into a template binding, and a template binding
  // is exactly what a later edit could put back with every pure test still green.
  it('renders its on/off state from the shared predicate, not from Status alone', () => {
    const html = template;
    expect(html).toMatch(/\[class\.is-on\]="isOpen\(link\)"/);
    expect(html).toMatch(/\[attr\.aria-checked\]="isOpen\(link\)"/);
    // The half-predicate must not come back anywhere on the switch.
    expect(html).not.toMatch(/\[class\.is-on\]="link\.Status/);
    expect(html).not.toMatch(/\[attr\.aria-checked\]="link\.Status/);
  });

  it('decides which way to move from the same predicate it rendered', () => {
    // The two disagreeing is what made the control close a link it had drawn as open.
    const ts = component;
    expect(ts).toMatch(/const reopening = !this\.isOpen\(link\);/);
  });

  it('reports a close that did not withdraw the token, as it already does for an issue', () => {
    const ts = component;
    expect(ts).toMatch(/warnIfStillRedeemable\(link\.ID\)/);
    expect(ts).toMatch(/credentialMayStillRedeem\(link\)/);
  });
});
