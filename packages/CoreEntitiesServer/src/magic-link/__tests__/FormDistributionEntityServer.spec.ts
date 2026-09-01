/**
 * Structural guards for the credential lifecycle hook.
 *
 * WHY SOURCE TEXT. `FormDistributionEntityServer` extends a generated `BaseEntity` subclass and
 * calls `super.Save()` / `super.Delete()`, so instantiating it needs MJ metadata, a provider and a
 * database — none of which exist in this vitest env. The decision (`provisioning-decision.ts`) and
 * the orchestration (`provision-runner.ts`) were pulled out precisely so they COULD be tested that
 * way, and they are, thoroughly. What is left in this class is the part that cannot be: the order
 * two `await`s happen in, which fields are read into the context, and the re-entrancy guard.
 *
 * That is exactly why it needs guarding rather than why it can be skipped. A review pass found the
 * class had no test of any kind and listed four one-line mutations that leave the whole suite
 * green — deleting the re-entrancy guard, writing half the credential pair, swapping the delete
 * order, mis-mapping a context field. Every one of those is a defect the file's own comments
 * describe at length as load-bearing, and the comments were the only thing enforcing them.
 *
 * They match on the call and the ordering rather than on formatting, so a reflow does not red
 * them, and each guards a decision whose failure mode is silence. Same trade-off, and the same
 * reasoning, as `distribution-manager.spec.ts` in the Angular package.
 *
 * That tolerance is a PROPERTY OF THE ASSERTIONS, not a promise the header can make on their
 * behalf. This file said "a reflow cannot red them" while the context-mapping check below used
 * `toContain` on an exact `key: this.Column,` string — one extra space, or a dropped trailing
 * comma, reds seven of them at once. A suite whose header misdescribes its own strictness sends
 * the next reader hunting a real regression in what was only a Prettier run. Every match here is
 * now whitespace-tolerant, which is what makes the sentence above true.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(__dirname, '..', 'FormDistributionEntityServer.ts'),
  'utf8',
).replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // the comments discuss every banned shape by name

/** The body of a method, from its signature to the next top-level closing brace. */
function bodyOf(name: string): string {
  const from = source.indexOf(name);
  expect(from, `${name} not found`).toBeGreaterThan(-1);
  return source.slice(from, source.indexOf('\n  }', from));
}

describe('the credential pair is written as one value', () => {
  it('sets BOTH columns in persistCredential, always together', () => {
    // Writing only the invite id is the bug the class comment says was removed: a reissue would
    // store the new invite beside the OLD token and serve a raw token the new invite cannot
    // redeem. Writing only the token orphans the invite instead.
    const body = bodyOf('private async persistCredential');
    expect(body).toMatch(/this\.MagicLinkInviteID\s*=/);
    expect(body).toMatch(/this\.PublicLinkToken\s*=/);
  });

  it('writes them unconditionally — no "only when empty" guard survives', () => {
    // The old code wrote the raw token only into an empty column, to keep a live link's URL
    // stable. That stability is now a property of the DECISION (a working credential is never
    // touched); leaving the guard here would make a reissue store a mismatched pair.
    const body = bodyOf('private async persistCredential');
    expect(body).not.toMatch(/if\s*\(\s*!this\.(?:PublicLinkToken|MagicLinkInviteID)/);
  });
});

describe('re-entrancy is bounded, not lucky', () => {
  it('keeps the in-flight guard, and checks it before provisioning', () => {
    // persistCredential calls Save(), which re-enters this override. One boolean is what makes
    // the nesting depth provably one; without it the reissue path — which is triggered BY a
    // cleared column — has no argument that it terminates at all.
    expect(source).toMatch(/private credentialWriteInFlight = false/);
    const save = bodyOf('public override async Save');
    expect(save).toMatch(/this\.credentialWriteInFlight/);
    expect(save).toMatch(/finally\s*\{\s*this\.credentialWriteInFlight = false/);
  });

  it('resets the guard in a finally, so a throw cannot wedge the record permanently', () => {
    expect(bodyOf('public override async Save')).toMatch(/finally/);
  });
});

describe('the credential columns are server-owned', () => {
  it('refuses client writes BEFORE the record is persisted, not after', () => {
    // Both columns ride the generated GraphQL update input and MJ's client sends every writable
    // field, so a stale builder tab writes the pre-rotation pair back on its next ordinary save.
    // Running the refusal after super.Save() would let that reach the database first.
    const save = bodyOf('public override async Save');
    const refusal = save.indexOf('refuseClientCredentialWrites');
    const superSave = save.indexOf('super.Save');
    expect(refusal).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(superSave);
  });

  it('restores the invite id from its OLD value rather than trusting the incoming one', () => {
    const body = bodyOf('private refuseClientCredentialWrites');
    expect(body).toMatch(/MagicLinkInviteID = invite\.OldValue/);
  });

  it('lets a client CLEAR the token — that is the reissue request — but never set one', () => {
    const body = bodyOf('private refuseClientCredentialWrites');
    expect(body).toMatch(/token\.Value !== null/);
    expect(body).toMatch(/PublicLinkToken = token\.OldValue/);
  });

  it('strips a credential supplied on CREATE, where there is no old value to restore', () => {
    const body = bodyOf('private refuseClientCredentialWrites');
    expect(body).toMatch(/!this\.IsSaved/);
    expect(body).toMatch(/this\.MagicLinkInviteID = null/);
  });
});

describe('deleting a distribution', () => {
  it('deletes FIRST and revokes after, so a refused delete cannot kill a live credential', () => {
    // `FormUpload.DistributionID` is a required FK, so any link that has taken an upload cannot
    // be deleted at all — refusal is the common case here, and revoking first would kill a live
    // link's credential every time one bounced.
    const body = bodyOf('public override async Delete');
    const del = body.indexOf('super.Delete');
    const revoke = body.indexOf('RevokeAnonymousInvite');
    expect(del).toBeGreaterThan(-1);
    expect(revoke).toBeGreaterThan(del);
  });

  it('captures the invite id BEFORE the delete, while the record still has one', () => {
    const body = bodyOf('public override async Delete');
    expect(body.indexOf('this.MagicLinkInviteID')).toBeLessThan(body.indexOf('super.Delete'));
  });

  it('returns false without revoking when the delete itself was refused', () => {
    expect(bodyOf('public override async Delete')).toMatch(/if\s*\(!\(await super\.Delete\([^)]*\)\)\)\s*\{\s*return false/);
  });

  it('names the invite it could not revoke — after the delete that id is the only handle left', () => {
    const body = bodyOf('public override async Delete');
    expect(body).toMatch(/orphaned/);
    expect(body).toMatch(/\$\{inviteId\}/);
  });

  it('tells the minter which resource the credential must belong to', () => {
    expect(bodyOf('public override async Delete')).toMatch(/resourceId:\s*distributionId/);
  });
});

describe('the provisioning context', () => {
  it('maps every field from the column of the same meaning', () => {
    // A mis-map here (isActive: this.CaptchaRequired, say) is invisible to every other test in
    // the repo, because the runner is tested against a context it is handed.
    const save = bodyOf('public override async Save');
    for (const [key, column] of [
      ['distributionId', 'this.ID'],
      ['channelType', 'this.ChannelType'],
      ['status', 'this.Status'],
      ['isActive', 'this.IsActive'],
      ['magicLinkInviteId', 'this.MagicLinkInviteID'],
      ['publicLinkToken', 'this.PublicLinkToken'],
      ['closeAt', 'this.CloseAt'],
    ]) {
      // Whitespace-tolerant, and the trailing comma optional: this asserts the MAPPING — which
      // context key reads which column — which is the thing whose failure is silent. Layout is
      // Prettier's business, and was never what this guard was about.
      expect(save, key).toMatch(
        new RegExp(`\\b${key}\\s*:\\s*${column.replace('.', '\\.')}\\s*[,}]`),
      );
    }
  });

  it('provisions AFTER the save, so the decision is about the state that actually landed', () => {
    const save = bodyOf('public override async Save');
    expect(save.indexOf('super.Save')).toBeLessThan(save.indexOf('runProvisioning'));
  });

  it('never fails the distribution save because provisioning failed', () => {
    const save = bodyOf('public override async Save');
    expect(save).toMatch(/catch/);
    expect(save.trimEnd()).toMatch(/return true;$/);
  });
});
