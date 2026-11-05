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
 * columns and `ResponseCount` are server-owned ({@link refuseClientServerColumnWrites}), a save
 * carries the values the store holds rather than the ones this instance loaded
 * ({@link adoptStoredServerColumns}), two writers of one
 * row take turns on a database row lock ({@link Save}), and a delete withdraws the credential in the
 * same transaction ({@link Delete}). Each exists because a concrete interleaving produced either an
 * orphaned live invite or a dead link badged Live; the docstring on each names it.
 *
 * It also holds the rules about the row's CONTENT that every writer must meet ({@link ValidateAsync}):
 * `AllowedOrigins` follows the embed-origin grammar, and a link is never opened on an archived form.
 *
 * See FORMS_BUILD_PLAN §4 item 4.
 */
import {
  BaseEntity,
  LogError,
  RunInEntityTransaction,
  RunView,
  type IRunViewProvider,
  type DatabaseProviderBase,
  type EntityDeleteOptions,
  type EntitySaveOptions,
  type IEntityDataProvider,
  type UserInfo,
  type ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  allowedOriginsRefusal,
  mjBizAppsFormsFormDistributionEntity,
  quoteSqlString,
  type mjBizAppsFormsFormDistributionEntityType,
} from '@mj-biz-apps/forms-entities';
import { addViolations, refuse, refuseIfUnvalidated, tracksStoredValues, type RuleViolation } from '../entities/entity-refusal.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { procedureCallInSchema } from '../shared/forms-procedure.js';
import { getMagicLinkProvisioningConfig } from './config.js';
import { MagicLinkMinterRegistry, type IAnonymousMagicLinkMinter, type InviteWriteHost } from './minter.js';
import { runProvisioning, DISTRIBUTION_ENTITY_NAME, type MintedLink } from './provision-runner.js';

/**
 * The SERVER-OWNED columns as the store holds them right now: the credential pair, and the
 * completion counter that submit advances with a conditional `UPDATE` outside this entity
 * (`submission/quota.ts`; a procedure on SQL Server).
 */
type StoredServerColumns = Pick<
  mjBizAppsFormsFormDistributionEntityType,
  'MagicLinkInviteID' | 'PublicLinkToken' | 'ResponseCount'
>;

/**
 * The provider surface a save needs to lock the row it is about to write: `ExecuteSQL` on the
 * provider's own connection (so the lock is taken inside the transaction it opened), the quoting
 * that names the procedure or table, and the dialect that picks the statement — the
 * `spFormDistributionReadServerColumnsLocked` call on SQL Server, a raw `FOR UPDATE` on PostgreSQL.
 */
type RowLockHost = IEntityDataProvider &
  Pick<DatabaseProviderBase, 'ExecuteSQL' | 'QuoteIdentifier' | 'QuoteSchemaAndView' | 'PlatformKey'>;

/** Whether the row's provider can take a row lock — every server database provider can. */
function locksRows(provider: IEntityDataProvider | undefined): provider is RowLockHost {
  return (
    !!provider &&
    'ExecuteSQL' in provider &&
    typeof provider.ExecuteSQL === 'function' &&
    'QuoteSchemaAndView' in provider &&
    typeof provider.QuoteSchemaAndView === 'function' &&
    'QuoteIdentifier' in provider &&
    typeof provider.QuoteIdentifier === 'function' &&
    'PlatformKey' in provider &&
    typeof provider.PlatformKey === 'string'
  );
}

/** Whether the row's provider can run a view — every server provider can; the read below needs one. */
function runsViews(provider: IEntityDataProvider | undefined): provider is IEntityDataProvider & IRunViewProvider {
  return !!provider && 'RunView' in provider && typeof provider.RunView === 'function';
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
   * Two writers of one row TAKE TURNS, on the database. A reissue persists its request — invite
   * linked, token cleared — with the first save and services it with the second, and in between
   * that state reads as "work owed" to any other save of the same row: a second save in that window
   * (another tab, an engine verb) revoked the already-revoked invite, minted a second replacement,
   * and left whichever invite lost the last write Active and unreferenced — the orphan
   * bizapps-forms#104 exists to remove, produced by the act of rotating. So an update runs as one
   * transaction on the row's own provider whose FIRST statement locks the row
   * ({@link adoptStoredServerColumns}); a second writer's lock waits until the first commits, then
   * reads what the first one landed. Submit's conditional slot `UPDATE` (a procedure on SQL Server) takes the same row lock, so it
   * queues behind this turn too. The hook's own re-entrant save runs inside the transaction
   * already held, so it neither opens another nor locks again.
   *
   * This replaced an in-process queue keyed by row id, which serialised writers in ONE API process
   * only. With two API instances behind a balancer — or an engine running on its own provider — the
   * same interleaving came straight back; a database lock is the only turn every writer must take.
   *
   * A create needs no turn: until it commits there is no row for another writer to hold.
   */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (this.credentialWriteInFlight) {
      return this.saveAndProvision(options); // the hook's own write, inside the turn already held
    }
    if (await refuseIfUnvalidated(this, options)) {
      return false;
    }
    if (!this.IsSaved) {
      return this.saveAndProvision(options); // no row yet, so nothing another writer could hold
    }
    const distributionId = this.ID;
    try {
      // The row's provider is also handed to the minter, so the invite writes the save provokes
      // land in this transaction and roll back with it — a revoke committed beside a rolled-back
      // save is a revoked invite beside a live token, the #104 dead link.
      const host = transactionalHost(this.ProviderToUse);
      return await RunInEntityTransaction(this.ProviderToUse, () => this.saveAndProvision(options, host));
    } catch (e) {
      // Rolled back: nothing this save wrote to the row stands. Refuse on the surface a refused save
      // already reports through, rather than throwing out of Save().
      const message =
        `Could not save distribution ${distributionId}: ${e instanceof Error ? e.message : String(e)}. ` +
        `The save was rolled back.`;
      LogError(`[FormDistributionEntityServer] ${message}`);
      return refuse(this, 'update', message);
    }
  }

  /** Opts in to {@link ValidateAsync} explicitly, as every Forms entity server subclass does. */
  public override get DefaultSkipAsyncValidation(): boolean {
    return false;
  }

  /**
   * `AllowedOrigins` must follow the embed-origin grammar, whoever writes it.
   *
   * The builder refused a bad entry before this existed, but only the builder: an import, an AI
   * action, a direct API write or `MJ.SaveEntityGraph` could store `*.acme.com`, which the request
   * path then silently DROPS — so the author believed a site was allowed that was not, or that a
   * restriction held that did not. The grammar is the contracts one (`allowedOriginsRefusal`), so
   * the builder, this check and the request path cannot disagree about what an entry is.
   *
   * Checked only when the column changes. A distribution already holding a bad list — written
   * before this rule — must still take an unrelated save (a rename, a cap edit); refusing that save
   * would turn a stale column into a link nobody can edit, and the request path already reads the bad
   * entries as dropped. "Changes" is MJ's dirty flag, which reflects the database only while the
   * entity tracks record changes (see `tracksStoredValues`); with that off it is the client's claim,
   * so the list is checked on every save instead of the whole update being refused — a submission
   * on a misconfigured host still counts unless the list really is bad.
   */
  public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    const violations: RuleViolation[] = [];
    if (this.changed('AllowedOrigins')) {
      const refusal = allowedOriginsRefusal(this.AllowedOrigins);
      if (refusal) {
        violations.push({ field: 'AllowedOrigins', message: refusal });
      }
    }
    const archived = await this.openOnArchivedFormRefusal();
    if (archived) {
      violations.push({ field: 'Status', message: archived });
    }
    return addViolations(result, violations, (field) => (field === 'Status' ? this.Status : this.AllowedOrigins));
  }

  /**
   * Whether `field` may differ from what the database holds — on a create, on a host that does not
   * track record changes (MJ's dirty flag is then the client's claim; see `tracksStoredValues`), or
   * when MJ says it changed.
   */
  private changed(field: string): boolean {
    return !this.IsSaved || !tracksStoredValues(this) || this.GetFieldByName(field)?.Dirty === true;
  }

  /**
   * An archived (Closed) form has no live link — whoever writes the link. Archiving closes every link
   * in the same transaction (`FormEntityServer`), and `FormDistributionEngine` refuses to issue or open
   * one on a Closed form before it writes anything; this is the rule behind both, so a plain save (the
   * generated Explorer form, a direct API write, `MJ.SaveEntityGraph`) cannot open one either. The
   * engine's check stays as the early refusal — it reads nothing twice that matters, and it also
   * refuses templates.
   *
   * Checked only when this save OPENS the link (it ends Active and IsActive, and one of those or its
   * form changed): a stray live link left on a Closed form must still take a save that opens nothing,
   * such as a rename, and closing it is always allowed.
   *
   * The form is read as the writer, inside the save. A form the writer cannot see answers exactly as
   * one that does not exist, so the refusal reveals nothing about a form the writer cannot read; a
   * read that fails refuses too (fail closed), its detail to the log only.
   *
   * Not a lock: an archive committing between this read and the write can still leave a live link
   * behind, which archiving again repairs (`FormAuthoringEngine.Archive`'s stray-link path).
   */
  private async openOnArchivedFormRefusal(): Promise<string | null> {
    const opens =
      this.Status === 'Active' &&
      this.IsActive === true &&
      (this.changed('Status') || this.changed('IsActive') || this.changed('FormID'));
    if (!opens) {
      return null;
    }
    const provider = this.ProviderToUse;
    if (!runsViews(provider)) {
      return 'This link cannot be opened: its form could not be read, so whether the form is archived is unknown.';
    }
    const read = await new RunView(provider).RunView<{ ID: string; Status: string }>(
      {
        EntityName: FORMS_ENTITY.Form,
        ExtraFilter: `ID=${quoteSqlString(this.FormID ?? '')}`,
        Fields: ['ID', 'Status'],
        ResultType: 'simple',
        BypassCache: true,
      },
      this.ContextCurrentUser,
    );
    if (!read.Success) {
      LogError(
        `[FormDistributionEntityServer] Could not read form ${this.FormID} to check distribution ${this.ID} opens on a ` +
          `form that is not archived: ${read.ErrorMessage}`,
      );
      return 'This link cannot be opened: its form could not be read, so whether the form is archived is unknown.';
    }
    const [form] = read.Results ?? [];
    if (!form) {
      return 'This link cannot be opened: its form was not found.';
    }
    return form.Status === 'Closed' ? 'This link cannot be opened: its form is archived. Restore the form first.' : null;
  }

  private async saveAndProvision(options?: EntitySaveOptions, host?: InviteWriteHost): Promise<boolean> {
    this.refuseClientServerColumnWrites();
    await this.adoptStoredServerColumns();
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
        host,
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
  private refuseClientServerColumnWrites(): void {
    if (this.credentialWriteInFlight) {
      return;
    }
    this.refuseClientCountWrite();
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
   * `ResponseCount` is the completion counter, and only submit's atomic slot `UPDATE` advances it
   * (final review I2). A row being CREATED starts at zero; a change on an update is put back here
   * and logged, and {@link adoptStoredServerColumns} then carries the stored value, so neither a
   * deliberate write nor a stale copy can reopen slots `MaxResponses` closed. The engine's own create
   * (`FormDistributionEngine.Issue`) already writes zero, so it passes through unchanged.
   */
  private refuseClientCountWrite(): void {
    if (!this.IsSaved) {
      if (this.ResponseCount !== 0) {
        LogError(
          `[FormDistributionEntityServer] Ignoring a ResponseCount of ${String(this.ResponseCount)} supplied on the ` +
            `creation of a distribution. A new link starts at 0; only a submission counts.`,
        );
        this.ResponseCount = 0;
      }
      return;
    }
    const count = this.GetFieldByName('ResponseCount');
    if (count?.Dirty) {
      LogError(
        `[FormDistributionEntityServer] Ignoring a client write of ResponseCount on distribution ${this.ID} ` +
          `(${String(count.OldValue)} -> ${String(count.Value)}). Only a submission advances that counter.`,
      );
      this.ResponseCount = Number(count.OldValue);
    }
  }

  /**
   * Lock this row, and make this save carry the server-owned columns THE STORE holds, not the ones
   * this instance loaded — one statement for all three.
   *
   * The count: submit advances `ResponseCount` with a conditional `UPDATE`, never through this
   * entity, so every loaded copy of the row is behind it. Written back from a copy loaded when the
   * builder opened, the counter went DOWN and `MaxResponses` could be exceeded (final review I2). The
   * stored value is carried on every update, whoever saves.
   *
   *
   * The pair: MJ writes every column on an update, dirty or not. So an instance loaded before a
   * rotation and saved after it — a server-side writer holding the row across other work — put the
   * OLD pair back: a revoked invite beside its dead token, which `decideProvisioning` reads as
   * `current` and never re-mints, and which the builder badges Live. A permanently dead link,
   * produced by a rename. {@link refuseClientServerColumnWrites} cannot see this: it acts on DIRTY
   * fields, and a stale copy's credential columns are clean. So the pair is re-read on every update
   * and carried through, with one exception — a token this client cleared stays cleared, because
   * that is the reissue request and the whole point of the save.
   *
   * The lock: the read takes an update lock held to the end of the transaction {@link Save} opened
   * (`UPDLOCK, HOLDLOCK` on SQL Server, `FOR UPDATE` on PostgreSQL), so it is also the turn a
   * concurrent writer of this row waits for — and what it then reads is the pair this writer
   * landed. It goes to the base TABLE, not the view: a lock hint on a view would lock every table
   * the view joins. Through this row's own provider, so it runs inside that transaction; never
   * through a cache.
   *
   * A read that fails leaves the loaded values in place and says so: refusing the save would turn a
   * narrow race into a failed edit, and the loaded values are what every save wrote before the
   * re-read existed.
   */
  private async adoptStoredServerColumns(): Promise<void> {
    if (this.credentialWriteInFlight || !this.IsSaved) {
      return;
    }
    const token = this.GetFieldByName('PublicLinkToken');
    const clearRequested = Boolean(token?.Dirty) && !this.PublicLinkToken;

    const stored = await this.readStoredServerColumnsLocked();
    if ('failure' in stored) {
      LogError(
        `[FormDistributionEntityServer] Could not read the stored server-owned columns of distribution ${this.ID} ` +
          `before saving it (${stored.failure}); saving the loaded values instead, without a row lock.`,
      );
      return;
    }
    this.MagicLinkInviteID = stored.MagicLinkInviteID;
    this.PublicLinkToken = clearRequested ? null : stored.PublicLinkToken;
    this.ResponseCount = stored.ResponseCount;
  }

  /** The stored server-owned columns, read under an update lock on this row — or why they could not be. */
  private async readStoredServerColumnsLocked(): Promise<StoredServerColumns | { failure: string }> {
    const provider = this.ProviderToUse;
    if (!locksRows(provider)) {
      return { failure: 'the provider cannot run SQL, so the row cannot be locked or re-read' };
    }
    try {
      // Built inside the try: a provider whose quoting throws takes the same fail-soft path as a
      // failed read, rather than throwing out of the save.
      const sql =
        provider.PlatformKey === 'postgresql'
          ? this.postgresLockedReadStatement(provider)
          : // The procedure (#338) holds the UPDLOCK, HOLDLOCK: MJ's runtime roles may EXECUTE it
            // but hold no rights on the base table. On this provider, so inside the save's transaction.
            procedureCallInSchema(provider, this.EntityInfo.SchemaName, 'spFormDistributionReadServerColumnsLocked', { ID: this.ID });
      const rows = await provider.ExecuteSQL<StoredServerColumns>(sql, undefined, undefined, this.ContextCurrentUser);
      const row = rows[0];
      if (!row) {
        return { failure: 'no row' };
      }
      // The column is NOT NULL INT; anything else is a driver or schema surprise, and adopting it
      // would write garbage into the counter the quota decides on.
      if (typeof row.ResponseCount !== 'number' || !Number.isFinite(row.ResponseCount)) {
        return { failure: `the stored ResponseCount is not a number (${String(row.ResponseCount)})` };
      }
      return row;
    } catch (e) {
      return { failure: e instanceof Error ? e.message : String(e) };
    }
  }

  /** PostgreSQL's locked re-read: the raw `SELECT … FOR UPDATE` on the base table. */
  private postgresLockedReadStatement(provider: RowLockHost): string {
    const q = (name: string): string => provider.QuoteIdentifier(name);
    const table = provider.QuoteSchemaAndView(this.EntityInfo.SchemaName, this.EntityInfo.BaseTable);
    return `SELECT ${q('MagicLinkInviteID')}, ${q('PublicLinkToken')}, ${q('ResponseCount')} FROM ${table} WHERE ${q('ID')} = ${quoteSqlString(this.ID)} FOR UPDATE`;
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
      return refuse(this, 'delete', message);
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
