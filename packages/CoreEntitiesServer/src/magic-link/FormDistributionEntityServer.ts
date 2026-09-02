/**
 * Server-side lifecycle hook for `MJ_BizApps_Forms: Form Distributions`.
 *
 * Owns the whole life of a distribution's anonymous magic-link credential: it mints
 * one when the distribution becomes a live public/anonymous channel, revokes it when
 * the distribution stops being one, and reissues it on request. Because it fires from
 * `Save()`, it applies to EVERY writer — builder, AI, Action, import, direct API — so
 * a link taken out of service by any of them has its credential withdrawn too. That
 * writer-agnosticism is the point of putting this here rather than in the builder
 * (bizapps-forms#104); the invariant it enforces is stated once, in
 * `provisioning-decision.ts`.
 *
 * Registered via `@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Distributions')`
 * so MJ's class factory instantiates THIS subclass server-side. The work is delegated
 * through the `MagicLinkMinterRegistry` seam (see minter.ts); when no host minter is
 * registered (host has not enabled core `magicLink`), the hook logs a clear warning
 * and leaves the record alone WITHOUT failing the save. The orchestration lives in
 * `runProvisioning` (provision-runner.ts) so it is unit-testable without a DB.
 *
 * What this class owns itself is everything about the ROW rather than the decision: the credential
 * columns are server-owned ({@link refuseClientCredentialWrites}), a save carries the pair the store
 * holds rather than the one this instance loaded ({@link adoptStoredCredential}), two writers of one
 * row take turns ({@link Save}), and a delete withdraws the credential in the same transaction
 * ({@link Delete}). Each exists because a concrete interleaving produced either an orphaned live
 * invite or a dead link badged Live; the docstring on each names it.
 *
 * See FORMS_BUILD_PLAN §4 item 4.
 */
import {
  BaseEntity,
  BaseEntityResult,
  LogError,
  RunInEntityTransaction,
  RunView,
  type EntityDeleteOptions,
  type EntitySaveOptions,
  type IEntityDataProvider,
  type IRunViewProvider,
  type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  mjBizAppsFormsFormDistributionEntity,
  quoteSqlString,
  type mjBizAppsFormsFormDistributionEntityType,
} from '@mj-biz-apps/forms-entities';
import { getMagicLinkProvisioningConfig } from './config.js';
import { MagicLinkMinterRegistry, type IAnonymousMagicLinkMinter, type InviteWriteHost } from './minter.js';
import { runProvisioning, DISTRIBUTION_ENTITY_NAME, type MintedLink } from './provision-runner.js';

/** The credential pair as the store holds it right now. */
type StoredCredential = Pick<mjBizAppsFormsFormDistributionEntityType, 'MagicLinkInviteID' | 'PublicLinkToken'>;

/**
 * Saves in flight, per distribution, so two writers of one row take turns — see {@link Save}.
 *
 * Keyed by the row id, holding a promise that settles when the last save to claim that id has
 * finished. A claimant chains onto whatever is there and replaces it; the entry is removed when
 * the claimant that put it there is done, so an idle row costs nothing. In-process only: MJAPI is
 * one process, and the public submit path — the concurrent writer that matters — runs inside it.
 */
const savesInFlight = new Map<string, Promise<void>>();

/**
 * Run `work` after every earlier claim on `id` has settled, and hold the id until it is done.
 *
 * The wait is bounded by the previous save's own completion, which MJ bounds with its database
 * timeouts; there is deliberately no timeout of its own, because giving up waiting would let the
 * race back in silently. A failed predecessor does not block a successor — the chain waits on
 * settlement, not success.
 */
async function takeTurn<T>(id: string, work: () => Promise<T>): Promise<T> {
  const key = id.trim().toUpperCase();
  const previous = savesInFlight.get(key) ?? Promise.resolve();
  const turn = previous.then(work);
  const settled = turn.then(
    () => undefined,
    () => undefined,
  );
  savesInFlight.set(key, settled);
  try {
    return await turn;
  } finally {
    if (savesInFlight.get(key) === settled) {
      savesInFlight.delete(key);
    }
  }
}

/** Whether this provider also runs views — the half of it a fresh read of the store goes through. */
function runsViews(provider: IEntityDataProvider): provider is IEntityDataProvider & IRunViewProvider {
  return 'RunView' in provider && typeof provider.RunView === 'function';
}

/**
 * A provider that can hold a delete and a credential write in one transaction: it opens scopes,
 * and it creates the entity the write goes through, so that write lands inside the scope.
 */
type TransactionalHost = Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'> &
  InviteWriteHost;

/**
 * Whether this provider also carries the metadata half — `GetEntityObject` — that creates the
 * entity a credential write goes through. `ProviderToUse` is typed as the entity-data half only;
 * every server provider implements both on one object, which is what this checks at runtime.
 */
function createsEntities(provider: IEntityDataProvider): provider is IEntityDataProvider & InviteWriteHost {
  return 'GetEntityObject' in provider && typeof provider.GetEntityObject === 'function';
}

/**
 * The row's own provider, when it can host the delete and the revoke as one unit of work.
 *
 * `undefined` means the two writes cannot share a transaction here — a client-side provider, or
 * one with no transaction support — and the caller falls back to the non-atomic order.
 */
function transactionalHost(provider: IEntityDataProvider | undefined): TransactionalHost | undefined {
  if (!provider || provider.SupportsEntityTransactions !== true || !provider.BeginEntityTransaction) {
    return undefined;
  }
  return createsEntities(provider) ? provider : undefined;
}

@RegisterClass(BaseEntity, DISTRIBUTION_ENTITY_NAME)
export class FormDistributionEntityServer extends mjBizAppsFormsFormDistributionEntity {
  /**
   * True while this instance is writing the credential back onto itself.
   *
   * {@link persistCredential} calls `Save()`, which re-enters this override. With one
   * action that recursion terminated by luck — the freshly-set invite id made the
   * decision short-circuit. There are three actions now, and one of them (reissue)
   * is triggered BY a cleared column, so "prove each path settles" is no longer a
   * cheap thing to keep true. An explicit guard costs one boolean and makes the
   * nesting depth provably one, per the repo's cap-every-unbounded-loop rule.
   */
  private credentialWriteInFlight = false;

  /**
   * Persists the distribution, then (post-save) restores its magic-link credential
   * invariant. Provisioning never blocks the save: a missing minter or any failure
   * is logged, and the distribution stands.
   *
   * Post-save rather than pre-save because the decision has to be about the state
   * that actually landed. A revocation driven by values that then failed to save
   * would kill a live link's credential over a write that never happened.
   *
   * Two writers of one row TAKE TURNS ({@link takeTurn}). A reissue persists its request —
   * invite linked, token cleared — with the first save and services it with the second, and in
   * between that state reads as "work owed" to any other save of the same row: a public
   * submission bumping `ResponseCount` in that window revoked the already-revoked invite, minted
   * a second replacement, and left whichever invite lost the last write Active and unreferenced —
   * the orphan bizapps-forms#104 exists to remove, produced by the act of rotating. Serialised,
   * the second writer runs after the rotation has landed, and {@link adoptStoredCredential} then
   * hands it the new pair. The hook's own re-entrant save runs inside the turn already held.
   */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (this.credentialWriteInFlight || !this.IsSaved) {
      return this.saveAndProvision(options);
    }
    return takeTurn(this.ID, () => this.saveAndProvision(options));
  }

  private async saveAndProvision(options?: EntitySaveOptions): Promise<boolean> {
    this.refuseClientCredentialWrites();
    await this.adoptStoredCredential();
    const saved = await super.Save(options);
    if (!saved || this.credentialWriteInFlight) {
      return saved;
    }

    this.credentialWriteInFlight = true;
    try {
      await runProvisioning(
        {
          distributionId: this.ID,
          channelType: this.ChannelType,
          status: this.Status,
          isActive: this.IsActive,
          magicLinkInviteId: this.MagicLinkInviteID,
          publicLinkToken: this.PublicLinkToken,
          closeAt: this.CloseAt,
        },
        getMagicLinkProvisioningConfig(),
        MagicLinkMinterRegistry.Instance.Minter,
        this.ContextCurrentUser,
        (credential) => this.persistCredential(credential),
      );
    } catch (e) {
      // Defensive: the runner is fail-soft, but a thrown error must never undo a
      // successful distribution save.
      LogError(
        `[FormDistributionEntityServer] Provisioning threw for distribution ${this.ID}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      this.credentialWriteInFlight = false;
    }

    return true;
  }

  /**
   * Put back any credential value this save did not have the right to change.
   *
   * The credential pair is SERVER-OWNED, and until this existed nothing said so. Both columns
   * ride the generated GraphQL update input, MJ's client sends every non-read-only field, and
   * `ResolverBase.UpdateRecord` ends in an unconditional `SetMany(clientNewValues)` — so a
   * builder tab holding a record from before a reissue writes the OLD pair back on its next
   * ordinary save (a rename, a cap edit), with no conflict and no warning. That silently
   * reverts a rotation: the link is badged Live on a token that no longer redeems, and the
   * invite that replaced it is left `Active` with nothing referencing it — the orphaned live
   * credential bizapps-forms#104 exists to remove, reintroduced by the act of rotating.
   *
   * The rule is asymmetric because the two halves mean different things to a client:
   *
   *  - `MagicLinkInviteID` is never a client's to write. It is the handle used to REVOKE, so a
   *    write here also lets one distribution point at another's invite and kill it on the next
   *    save — a save the public submit path performs, under the elevated system user.
   *  - `PublicLinkToken` may only be CLEARED. Clearing is the documented reissue request and the
   *    builder's Reissue button; setting it to a value is either a stale copy or an attempt to
   *    install a token no invite hashes to, and both are refused.
   *
   * Skipped while {@link persistCredential} is writing, which is the one writer that owns these
   * columns. A raw `UPDATE` bypasses this entirely — deliberately, since the invariant is
   * restored from CURRENT state on the next save either way; the ownership check in the minter
   * is what protects the invite itself from that direction.
   */
  private refuseClientCredentialWrites(): void {
    if (this.credentialWriteInFlight) {
      return;
    }
    if (!this.IsSaved) {
      // A record being CREATED has no old value to restore, and a credential it arrived holding
      // was never issued by this hook — it names an invite minted for some other distribution, or
      // none at all. Either way the new row must start with none, and the decision below then
      // mints it one. Without this the whole guard has a create-shaped hole straight through it.
      if (this.MagicLinkInviteID || this.PublicLinkToken) {
        LogError(
          `[FormDistributionEntityServer] Ignoring a credential supplied on the creation of a ` +
            `distribution (invite ${String(this.MagicLinkInviteID)}). New links are issued their own.`,
        );
        this.MagicLinkInviteID = null;
        this.PublicLinkToken = null;
      }
      return;
    }
    const invite = this.GetFieldByName('MagicLinkInviteID');
    if (invite?.Dirty) {
      LogError(
        `[FormDistributionEntityServer] Ignoring a client write of MagicLinkInviteID on distribution ` +
          `${this.ID} (${String(invite.OldValue)} -> ${String(invite.Value)}). That column is written only by ` +
          `this hook; clear PublicLinkToken to ask for a reissue.`,
      );
      this.MagicLinkInviteID = invite.OldValue as string | null;
    }
    const token = this.GetFieldByName('PublicLinkToken');
    if (token?.Dirty && token.Value !== null && token.Value !== '') {
      LogError(
        `[FormDistributionEntityServer] Ignoring a client write of PublicLinkToken on distribution ` +
          `${this.ID}. A token is issued only by this hook; clearing the column is the way to ask for a new one.`,
      );
      this.PublicLinkToken = token.OldValue as string | null;
    }
  }

  /**
   * Make this save carry the credential pair THE STORE holds, not the one this instance loaded.
   *
   * MJ writes every column on an update, dirty or not. So an instance loaded before a rotation and
   * saved after it — a server-side writer holding the row across other work — put the OLD pair
   * back: a revoked invite beside its dead token, which `decideProvisioning` reads as `current` and
   * never re-mints, and which the builder badges Live. A permanently dead link, produced by a
   * rename. {@link refuseClientCredentialWrites} cannot see this: it acts on DIRTY fields, and a
   * stale copy's credential columns are clean. So the pair is re-read from the store on every
   * update and carried through, with one exception — a token this client cleared stays cleared,
   * because that is the reissue request and the whole point of the save.
   *
   * One read per update of a distribution, which includes every public submission. Through this
   * row's own provider, so it sees whatever transaction that provider holds open, and past the
   * server's cache, because the write that made the loaded copy stale may have come from another
   * process this cache never heard about.
   *
   * A read that fails leaves the loaded values in place and says so: refusing the save would turn a
   * narrow race into a failed submission, and the loaded values are what every save wrote before
   * this existed.
   */
  private async adoptStoredCredential(): Promise<void> {
    if (this.credentialWriteInFlight || !this.IsSaved) {
      return;
    }
    const token = this.GetFieldByName('PublicLinkToken');
    const clearRequested = Boolean(token?.Dirty) && !this.PublicLinkToken;

    const provider = this.ProviderToUse;
    const rv = provider && runsViews(provider) ? new RunView(provider) : new RunView();
    const read = await rv.RunView<StoredCredential>(
      {
        EntityName: DISTRIBUTION_ENTITY_NAME,
        ExtraFilter: `ID=${quoteSqlString(this.ID)}`,
        Fields: ['MagicLinkInviteID', 'PublicLinkToken'],
        ResultType: 'simple',
        MaxRows: 1,
        BypassCache: true,
      },
      this.ContextCurrentUser,
    );
    const stored = read.Success ? read.Results?.[0] : undefined;
    if (!stored) {
      LogError(
        `[FormDistributionEntityServer] Could not read the stored credential of distribution ${this.ID} ` +
          `before saving it (${read.Success ? 'no row' : read.ErrorMessage ?? 'unknown error'}); saving the ` +
          `loaded values instead.`,
      );
      return;
    }
    this.MagicLinkInviteID = stored.MagicLinkInviteID;
    this.PublicLinkToken = clearRequested ? null : stored.PublicLinkToken;
  }

  /**
   * Deletes the distribution and withdraws the credential it was holding — as ONE unit of work.
   *
   * Without this the invariant survives every state change and not the one that ends
   * the record: a deleted distribution took its only reference to a still-`Active`
   * invite with it, leaving a live credential nothing points at and no later save can
   * reach. Deleting and recreating was also the pre-#104 recourse for a leaked link,
   * so it is the very path most likely to be used on a credential someone wants dead.
   *
   * The two writes share a transaction (`RunInEntityTransaction`, the primitive MJ core ships for
   * exactly this), so neither outcome the old ordering had to choose between can happen: a
   * refused delete cannot leave a live link's credential dead, because the revoke is rolled back
   * with it — and refusal is the common case here, since `FormUpload.DistributionID` is a required
   * FK; and a failed revoke cannot leave an orphaned invite whose only handle is a log line, because
   * the delete is rolled back instead and REFUSED, with the reason on `LatestResult`. The row then
   * still points at its invite, so the next attempt, or a pause, retries from a consistent state.
   *
   * Delete first inside the transaction, deliberately: a refused delete then returns without a
   * revoke having been issued at all, rather than relying on the rollback to undo one.
   *
   * The revoke joins the transaction only because the minter is handed THIS row's provider to
   * create the invite entity on (see `InviteWriteHost`); a minter left to `new Metadata()` writes
   * through the process-wide provider, on another connection, outside any scope opened here.
   * Where the provider cannot transact at all, this degrades to the old order — delete, then a
   * best-effort revoke whose failure names the orphan — since a delete that has landed cannot be
   * reported as refused.
   */
  public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
    const inviteId = this.MagicLinkInviteID?.trim();
    if (!inviteId) {
      return super.Delete(options);
    }
    const contextUser = this.ContextCurrentUser;
    const minter = MagicLinkMinterRegistry.Instance.Minter;
    const host = transactionalHost(this.ProviderToUse);
    if (!minter || !contextUser || !host) {
      if (!(await super.Delete(options))) {
        return false;
      }
      await this.withdrawAfterDelete(inviteId, minter, contextUser);
      return true;
    }

    const distributionId = this.ID;
    try {
      return await RunInEntityTransaction(host, async () => {
        if (!(await super.Delete(options))) {
          return false;
        }
        const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser, host);
        if (!revoked.success) {
          throw new Error(revoked.message ?? 'unknown error');
        }
        return true;
      });
    } catch (e) {
      // Rolled back: the row and its credential are exactly as they were. Refuse, and say why, on
      // the same surface a refused delete already reports through.
      const message =
        `Could not delete distribution ${distributionId}: withdrawing its magic-link invite ${inviteId} ` +
        `failed (${e instanceof Error ? e.message : String(e)}), so the delete was rolled back. The link ` +
        `and its credential are unchanged; try again, or pause the link instead.`;
      LogError(`[FormDistributionEntityServer] ${message}`);
      this.RegisterResultHistoryEntry(new BaseEntityResult(false, message, 'delete'));
      return false;
    }
  }

  /**
   * The non-atomic tail: the row is already gone, so all that is left is to try the revoke and,
   * if that fails, name the invite — after the delete that id is the only handle on it.
   */
  private async withdrawAfterDelete(
    inviteId: string,
    minter: IAnonymousMagicLinkMinter | undefined,
    contextUser: UserInfo | undefined,
  ): Promise<void> {
    const distributionId = this.ID;
    const orphaned = (why: string): void =>
      LogError(
        `[FormDistributionEntityServer] Deleted distribution ${distributionId} but could not revoke ` +
          `its magic-link invite ${inviteId}: ${why}. That invite is now orphaned and must be revoked by hand.`,
      );
    if (!minter || !contextUser) {
      orphaned(minter ? 'no context user' : 'no minter registered');
      return;
    }
    try {
      const revoked = await minter.RevokeAnonymousInvite({ inviteId, resourceId: distributionId }, contextUser);
      if (!revoked.success) {
        orphaned(revoked.message ?? 'unknown error');
      }
    } catch (e) {
      orphaned(`the revoke threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Make this record's credential be exactly `credential` — or none, given `null` —
   * with a single targeted second save.
   *
   * Both columns are written unconditionally, together. The old version wrote the raw
   * token only into an empty column, to keep a live link's redeem URL stable; that
   * stability is now a property of the DECISION (a live link with a working credential
   * is never touched at all — see `decideProvisioning`) rather than of this write, and
   * leaving the guard here would have been actively wrong: a reissue would have stored
   * the new invite id beside the old token, serving a raw token the new invite cannot
   * redeem. The pair is one value; it moves as one.
   */
  private async persistCredential(credential: MintedLink | null): Promise<boolean> {
    this.MagicLinkInviteID = credential?.inviteId ?? null;
    this.PublicLinkToken = credential?.rawToken ?? null;
    if (!(await this.Save())) {
      const what = credential ? `store invite ${credential.inviteId} on` : 'clear the credential of';
      LogError(
        `[FormDistributionEntityServer] Failed to ${what} distribution ${this.ID}: ` +
          `${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
      return false;
    }
    return true;
  }
}
