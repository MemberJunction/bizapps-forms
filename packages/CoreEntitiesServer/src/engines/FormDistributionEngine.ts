/**
 * `FormDistributionEngine` — the share-link verbs (spec #303 §4): issue, reissue, open, close; the
 * slug a new link gets; the respondent URL every verb returns; and which of a form's slugs other
 * apps claim.
 *
 * These were the builder's (`forms-ng`'s `distribution.service.ts`) and a GraphQL resolver's
 * (`DistributionClaimsResolver`). Here they are one server API, so the builder, an Action and an
 * agent get the same link from the same call.
 *
 * What this engine does NOT do is touch the credential. Minting, revoking and reissuing the
 * anonymous magic-link credential stay in `FormDistributionEntityServer.Save`, so a plain entity
 * save of a distribution still provisions, and there is one enforcement point. The engine sets
 * fields and saves through that subclass — `requireServerEntity` refuses the plain generated class,
 * whose save would leave every link without a credential — and then reports what landed.
 *
 * Transactions differ by verb, on purpose:
 *  - Open, Close and Reissue each run as one unit of work (`runEngineUnitOfWork`). The subclass's
 *    save joins it as a savepoint, row lock and credential writes included, so a refusal rolls the
 *    whole verb back.
 *  - Issue does NOT open one (`runEngineCall`), and refuses to run inside a caller's. Its slug retry
 *    depends on a failed INSERT leaving the connection usable, and inside a transaction a failed
 *    statement can doom it (PostgreSQL aborts the whole transaction). A new row also has nothing to
 *    roll back to: each attempt either inserts or does not, and the create's mint runs on the
 *    minter's own connection (a create has no row lock to share — see the subclass), so an enclosing
 *    rollback would orphan a live invite rather than undo it.
 *
 * What a caller is told is safe to tell them. A row the caller cannot read (row-level security, no
 * Read grant) gets the same "does not exist" answer as one that does not exist — every read runs as
 * the caller, so it simply is not there — and no message carries provider or database text, which
 * may hold SQL or other records' values: that rides on `FormDistributionError.logDetail` to the log.
 */
import {
  EntitySaveOptions,
  LogStatus,
  type DatabaseProviderBase,
  type UserInfo,
} from '@memberjunction/core';
import { BaseSingleton, GetGlobalObjectStore } from '@memberjunction/global';
import {
  isOpenToResponses,
  quoteSqlString,
  randomSlugSuffix,
  respondentUrl,
  slugify,
  slugRefusal,
  suffixedSlug,
  type mjBizAppsFormsFormDistributionEntityType,
  type mjBizAppsFormsFormEntityType,
} from '@mj-biz-apps/forms-entities';
import type { ClaimLookup } from '../distribution-claims/claim-contract.js';
import { findDistributionClaims, readClaimProviders } from '../distribution-claims/find-claims.js';
import type { DistributionChannelType } from '../magic-link/config.js';
import { FormDistributionEntityServer } from '../magic-link/FormDistributionEntityServer.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { requireEntityTransactions, requireServerEntity, runEngineCall, runEngineUnitOfWork, saveFailure } from './engine-guards.js';
import { isGuid } from '../shared/guid.js';

const ENTITY = FORMS_ENTITY;

/**
 * How many slugs `Issue` tries before giving up. The first is the preferred slug (or, when the probe
 * found it taken, the first suffixed one); each later one gets a fresh random suffix. Five 5-character
 * base-36 suffixes colliding in a row means something other than bad luck is wrong.
 */
export const MAX_SLUG_ATTEMPTS = 5;

/**
 * The channel a link is issued under when the caller names none.
 *
 * `ChannelType` reads like a property of the link but is really a server switch:
 * `FORMS_MAGICLINK_CHANNELS` decides which channels get an anonymous credential, and PublicLink,
 * Embed and QR — all in the default allow-list — behave identically. `Email` is the one that differs
 * (individually addressed, so not in the default list), which is why the default is a constant and
 * not Email: a link created under a channel that gets no credential is a dead link.
 */
export const DEFAULT_CHANNEL: DistributionChannelType = 'PublicLink';

/** The unique index on `FormDistribution.Slug`; a save failure naming it is a slug collision. */
const SLUG_INDEX = 'UQ_FormDistribution_Slug';

/** How a derived link name spells each channel. */
const CHANNEL_LABELS: Record<DistributionChannelType, string> = {
  PublicLink: 'Public link',
  Embed: 'Embed',
  QR: 'QR code',
  Email: 'Email',
};

/** `FormDistribution.Name` is NVARCHAR(255). */
const MAX_NAME_LENGTH = 255;

type DistributionStatus = mjBizAppsFormsFormDistributionEntityType['Status'];
type FormFacts = Pick<mjBizAppsFormsFormEntityType, 'ID' | 'Name' | 'Status' | 'IsTemplate'>;

/** What `Issue` is asked for. Every field but `formId` is optional and has the builder's default. */
export interface IssueLinkRequest {
  formId: string;
  /** Default {@link DEFAULT_CHANNEL}. */
  channelType?: DistributionChannelType;
  /** Display name. Blank or absent: `<form name> — <channel>`. */
  name?: string;
  /** Preferred slug, which must already be slug-shaped (`slugRefusal`). Absent: derived from the name. Taken: suffixed. */
  slug?: string;
  /** Response cap; `null` or absent is uncapped. A whole number of at least 1 (the operation checks the wire). */
  maxResponses?: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  /** Default `false`: Turnstile is fail-closed, so a captcha on by default would refuse every submit on a host without keys. */
  captchaRequired?: boolean;
}

/** A share link's state after a verb, as it landed. */
export interface DistributionLink {
  distributionId: string;
  slug: string | null;
  status: DistributionStatus;
  /**
   * The `/f/:slug` address a respondent opens — `null` while the link is not open to responses,
   * holds no credential (none could be provisioned, or its channel gets none), or the host has not
   * set `MJAPI_PUBLIC_URL`, the only public address the server knows itself by.
   */
  respondentUrl: string | null;
}

/**
 * A share-link verb that did not happen. `fault: true` when the system failed (a read or a save) —
 * logged as an error; otherwise a refusal over what was asked — logged as a status.
 *
 * `message` is what the caller sees (an operation returns it as `ErrorMessage`), so it never carries
 * provider or database text. That goes in `logDetail`, which `runEngineCall` appends to the one log
 * line it writes.
 */
export class FormDistributionError extends Error {
  public readonly fault: boolean;
  public readonly logDetail?: string;

  constructor(message: string, options: { fault?: boolean; logDetail?: string } = {}) {
    super(message);
    this.name = 'FormDistributionError';
    this.fault = options.fault === true;
    this.logDetail = options.logDetail;
  }
}

/** How each verb on an existing link changes it. */
interface LinkVerb {
  /** "open", "close", "reissue" — for messages. */
  name: string;
  /** "opened", "closed", "reissued" — for messages. */
  past: string;
  /** Refuse (throw) or change the loaded row; runs inside the verb's transaction. */
  apply(link: FormDistributionEntityServer, provider: DatabaseProviderBase, user: UserInfo): Promise<void>;
  /** Built per save: MJ is handed a fresh options object each time, never one shared across calls. */
  saveOptions?: () => EntitySaveOptions;
}

export class FormDistributionEngine extends BaseSingleton<FormDistributionEngine> {
  public static get Instance(): FormDistributionEngine {
    return super.getInstance<FormDistributionEngine>();
  }

  /**
   * Create a share link for a form, open to responses, and return it with its URL. The provisioning
   * hook mints its credential on the save. Throws {@link FormDistributionError} when it refuses; a
   * failure is logged once, with the form and the user.
   */
  public async Issue(request: IssueLinkRequest, provider: DatabaseProviderBase, user: UserInfo): Promise<DistributionLink> {
    const formId = request?.formId?.trim() ?? '';
    if (!formId) {
      throw new FormDistributionError('A form id is required to issue a share link.');
    }
    requireUser(user, `Issuing a share link for form ${formId}`);
    const refusal = issueRequestRefusal(request);
    if (refusal) {
      throw new FormDistributionError(refusal);
    }
    // No `requireEntityTransactions`: Issue opens none (see the header), so it needs none.
    if ((provider.TransactionDepth ?? 0) > 0) {
      throw new FormDistributionError(
        `Issuing a share link for form ${formId} cannot run inside a transaction: a slug collision would ` +
          'abort the enclosing transaction before the retry could run, and rolling it back would orphan ' +
          "the link's newly minted credential. Issue it on its own.",
      );
    }
    return runEngineCall(provider, `[FormDistributionEngine] no share link was issued for form ${formId} (user ${user.ID})`, () =>
      callerSafe('Issuing a share link', async () => {
      const form = await readShareableForm(formId, provider, user);
      const channel = request.channelType ?? DEFAULT_CHANNEL;
      const name = request.name?.trim() || derivedLinkName(form.Name, channel);
      const link = await newDistribution(provider, user);
      link.FormID = formId;
      link.Name = name;
      link.ChannelType = channel;
      // Created live, not Draft: the credential is minted only once a link is Active (see
      // provisioning-decision.ts), so a Draft link is a `/f/:slug` that refuses everyone.
      link.Status = 'Active';
      link.IsActive = true;
      link.ResponseCount = 0;
      link.CaptchaRequired = request.captchaRequired ?? false;
      link.MaxResponses = request.maxResponses ?? null;
      link.OpenAt = request.openAt ?? null;
      link.CloseAt = request.closeAt ?? null;
      await saveWithFreeSlug(link, request.slug ?? slugify(name, randomSlugSuffix), provider, user);
      return linkOf(link);
    }));
  }

  /**
   * Open a link to responses: `Status = 'Active'` AND `IsActive`, because "open" is both — writing
   * only `Status` left a row at `Active`/not-`IsActive` exactly as it was while reporting success.
   * The save is forced (`IgnoreDirtyState`), so a row already open is still written and its
   * credential re-checked, which is how a link whose mint failed earlier gets one. The form must be
   * shareable: a link on an archived form or a template could never be answered.
   */
  public async Open(distributionId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<DistributionLink> {
    return this.applyVerb(distributionId, provider, user, OPEN);
  }

  /** Close a link to responses; the provisioning hook revokes its credential in the same save. */
  public async Close(distributionId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<DistributionLink> {
    return this.applyVerb(distributionId, provider, user, CLOSE);
  }

  /**
   * Give an open link a new credential and keep its slug, so every poster, QR code and embed keeps
   * working and only a leaked credential stops. Clearing `PublicLinkToken` IS the request: the hook
   * reads a live link with no usable token as "reissue", revokes the old invite and mints the new
   * one in the same save. `MagicLinkInviteID` is left alone — it says which invite to revoke.
   */
  public async Reissue(distributionId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<DistributionLink> {
    return this.applyVerb(distributionId, provider, user, REISSUE);
  }

  /**
   * Which of a form's share-link slugs other installed apps own (#292). A read: the slugs are read
   * under the CALLER's permissions, and each claimant registered in the global object store
   * (`DISTRIBUTION_CLAIM_PROVIDERS_KEY`) is asked about them. A claimant that fails is a `failures`
   * entry, never "no claims" — but a failed slug read throws, because an empty answer must only ever
   * mean nobody owns these slugs. Who may ask is the operation's `Authorize`.
   */
  public async GetClaims(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<ClaimLookup> {
    const id = formId?.trim() ?? '';
    // The id goes into a SQL filter, so it must be one.
    if (!isGuid(id)) {
      throw new FormDistributionError(id ? 'The form id must be a form ID.' : 'A form id is required to look up share-link claims.');
    }
    requireUser(user, `Looking up share-link claims for form ${id}`);
    return runEngineCall(provider, `[FormDistributionEngine] share-link claims for form ${id} were not read (user ${user.ID})`, () =>
      callerSafe('Looking up share-link claims', async () => {
        // Read AS THE CALLER: claimants are asked only about slugs the caller can see, so a claim on
        // a link the caller may not read can never come back to them.
        const read = await provider.RunView<{ Slug: string }>(
          {
            EntityName: ENTITY.FormDistribution,
            ExtraFilter: `FormID=${quoteSqlString(id)} AND Slug IS NOT NULL`,
            Fields: ['Slug'],
            ResultType: 'simple',
          },
          user,
        );
        if (!read.Success) {
          // The view error can carry the SQL statement; it goes to the log, never to the caller.
          throw new FormDistributionError(`Could not read share links for form ${id}.`, {
            fault: true,
            logDetail: read.ErrorMessage || 'no detail',
          });
        }
        const registry = readClaimProviders(GetGlobalObjectStore());
        const found = await findDistributionClaims(
          (read.Results ?? []).map((row) => row.Slug),
          user,
          registry.providers,
        );
        return { claims: found.claims, failures: [...registry.failures, ...found.failures] };
      }),
    );
  }

  /** Load the link, let `verb` refuse or change it, save it through the subclass — one transaction. */
  private async applyVerb(
    distributionId: string,
    provider: DatabaseProviderBase,
    user: UserInfo,
    verb: LinkVerb,
  ): Promise<DistributionLink> {
    const id = distributionId?.trim() ?? '';
    if (!id) {
      throw new FormDistributionError(`A share link id is required to ${verb.name} a share link.`);
    }
    requireUser(user, `To ${verb.name} share link ${id}`);
    requireEntityTransactions(provider, `To ${verb.name} share link ${id}`);
    return runEngineUnitOfWork(provider, `[FormDistributionEngine] share link ${id} was not ${verb.past} (user ${user.ID})`, () =>
      callerSafe(`To ${verb.name} share link ${id}`, async () => {
        const link = await loadDistribution(id, provider, user);
        await verb.apply(link, provider, user);
        if (!(await link.Save(verb.saveOptions?.()))) {
          throw saveRefusal(`Could not ${verb.name} share link ${id}`, link);
        }
        return linkOf(link);
      }),
    );
  }
}

const OPEN: LinkVerb = {
  name: 'open',
  past: 'opened',
  apply: async (link, provider, user) => {
    await readShareableForm(link.FormID, provider, user);
    link.Status = 'Active';
    link.IsActive = true;
  },
  saveOptions: () => Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }),
};

const CLOSE: LinkVerb = {
  name: 'close',
  past: 'closed',
  apply: async (link) => {
    link.Status = 'Closed';
  },
};

const REISSUE: LinkVerb = {
  name: 'reissue',
  past: 'reissued',
  apply: async (link) => {
    // A link that is not open holds no credential, and the hook would mint none for it: the
    // verb would report success having changed nothing. Opening it is what issues a fresh one.
    if (!isOpenToResponses(link)) {
      throw new FormDistributionError(
        `Share link ${link.ID} is not open to responses, so it holds no credential to reissue; open it instead, which issues a fresh one.`,
      );
    }
    link.PublicLinkToken = null;
  },
};

/**
 * Run `work`, turning any error that is not already a {@link FormDistributionError} into one whose
 * message says only that `what` failed. An operation returns a thrown message to its caller as
 * `ErrorMessage`, and an unexpected throw — a dropped connection, a driver error, a misconfigured
 * host — speaks in SQL and other records' values; its words go to `logDetail`, for the log.
 */
async function callerSafe<T>(what: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof FormDistributionError) {
      throw err;
    }
    throw new FormDistributionError(`${what} failed on the server; the server log has the detail.`, {
      fault: true,
      logDetail: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
  }
}

function requireUser(user: UserInfo | undefined, what: string): asserts user is UserInfo {
  if (!user) {
    throw new FormDistributionError(`${what} needs the acting user; none was given.`);
  }
}

/**
 * Why the request's own values cannot make a link, or `null`. Checked before any read, so a value the
 * database would reject is a refusal over the request rather than a failed insert logged as a fault.
 * The operation checks the wire; this is what an in-process caller (an Action, an agent) meets.
 */
function issueRequestRefusal(request: IssueLinkRequest): string | null {
  if (request.slug !== undefined) {
    const refusal = slugRefusal(request.slug);
    if (refusal) {
      return refusal;
    }
  }
  const name = request.name?.trim() ?? '';
  if (name.length > MAX_NAME_LENGTH) {
    return `The link name is longer than ${MAX_NAME_LENGTH} characters (${name.length}).`;
  }
  for (const [field, value] of [['OpenAt', request.openAt], ['CloseAt', request.closeAt]] as const) {
    if (value !== undefined && value !== null && (!(value instanceof Date) || Number.isNaN(value.getTime()))) {
      return `${field} is not a valid date.`;
    }
  }
  if (request.openAt && request.closeAt && request.closeAt.getTime() <= request.openAt.getTime()) {
    return `The link closes before it opens (${request.closeAt.toISOString()} is not after ${request.openAt.toISOString()}).`;
  }
  return null;
}

function derivedLinkName(formName: string, channel: DistributionChannelType): string {
  const suffix = ` — ${CHANNEL_LABELS[channel]}`;
  return `${formName.trim().slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
}

/**
 * The form a link is for, refused unless a respondent could ever answer it there: it must exist, not
 * be a template (templates are never published), and not be archived — archiving closes every link,
 * and a link opened afterwards would break that invariant.
 */
async function readShareableForm(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormFacts> {
  const read = await provider.RunView<FormFacts>(
    {
      EntityName: ENTITY.Form,
      ExtraFilter: `ID=${quoteSqlString(formId)}`,
      Fields: ['ID', 'Name', 'Status', 'IsTemplate'],
      ResultType: 'simple',
      BypassCache: true,
    },
    user,
  );
  if (!read.Success) {
    throw new FormDistributionError(`Could not read form ${formId}.`, { fault: true, logDetail: read.ErrorMessage || 'no detail' });
  }
  const [form] = read.Results ?? [];
  if (!form) {
    throw new FormDistributionError(`Form ${formId} does not exist, so it cannot be shared.`);
  }
  if (form.IsTemplate) {
    throw new FormDistributionError(
      `Form ${formId} is a template; templates are never published, so a link to one could never be answered. Create a form from it and share that.`,
    );
  }
  if (form.Status === 'Closed') {
    throw new FormDistributionError(`Form ${formId} is archived; restore it before opening a share link to it.`);
  }
  return form;
}

async function loadDistribution(id: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormDistributionEntityServer> {
  const read = await provider.RunView<unknown>(
    { EntityName: ENTITY.FormDistribution, ExtraFilter: `ID=${quoteSqlString(id)}`, ResultType: 'entity_object', BypassCache: true },
    user,
  );
  if (!read.Success) {
    throw new FormDistributionError(`Could not read share link ${id}.`, { fault: true, logDetail: read.ErrorMessage || 'no detail' });
  }
  const [row] = read.Results ?? [];
  if (!row) {
    throw new FormDistributionError(`Share link ${id} does not exist.`);
  }
  return requireServerEntity(row, FormDistributionEntityServer, ENTITY.FormDistribution);
}

async function newDistribution(provider: DatabaseProviderBase, user: UserInfo): Promise<FormDistributionEntityServer> {
  const entity = await provider.GetEntityObject<FormDistributionEntityServer>(ENTITY.FormDistribution, user);
  const link = requireServerEntity(entity, FormDistributionEntityServer, ENTITY.FormDistribution);
  link.NewRecord();
  return link;
}

/**
 * Insert `link` under `preferred`, or under `preferred-<suffix>` when that is taken — probed first so
 * the common case keeps the clean slug, then retried on the unique index, which is the real guard
 * (two issues can probe the same free slug). Only a collision is retried; any other failure would
 * fail the same way again. Capped at {@link MAX_SLUG_ATTEMPTS}, and the cap is a refusal.
 */
async function saveWithFreeSlug(
  link: FormDistributionEntityServer,
  preferred: string,
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<void> {
  const takenAlready = await slugTaken(preferred, provider, user);
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    link.Slug = attempt === 0 && !takenAlready ? preferred : suffixedSlug(preferred, randomSlugSuffix());
    if (await link.Save()) {
      return;
    }
    if (!saveFailure(link).includes(SLUG_INDEX)) {
      throw saveRefusal(`Could not create a share link for form ${link.FormID}`, link);
    }
  }
  throw new FormDistributionError(
    `Could not find a free slug for "${preferred}" after ${MAX_SLUG_ATTEMPTS} attempts, so no share link was created for form ${link.FormID}.`,
    { fault: true },
  );
}

/**
 * Whether any link already uses `slug`. A failed read refuses rather than guessing: the builder
 * treated it as "taken" and moved on, but on the server a failed read means the insert after it is
 * likely to fail too, and the caller should hear why.
 */
async function slugTaken(slug: string, provider: DatabaseProviderBase, user: UserInfo): Promise<boolean> {
  const read = await provider.RunView(
    { EntityName: ENTITY.FormDistribution, ExtraFilter: `Slug=${quoteSqlString(slug)}`, ResultType: 'count_only', BypassCache: true },
    user,
  );
  if (!read.Success) {
    throw new FormDistributionError(`Could not check whether the slug "${slug}" is free.`, {
      fault: true,
      logDetail: read.ErrorMessage || 'no detail',
    });
  }
  return (read.TotalRowCount ?? 0) > 0;
}

/**
 * A refused save as the caller may see it. A rule the entity enforces (a validation failure, such as
 * the origins grammar or a link opened on an archived form) is written for authors, so its message is
 * passed on. Anything else — a database error, the subclass's rolled-back write — may carry SQL or
 * other records' values, so the caller is told only that it failed and the log gets the detail.
 */
function saveRefusal(what: string, link: FormDistributionEntityServer): FormDistributionError {
  const rules = (link.LatestResult?.Errors ?? [])
    .filter((e: unknown): e is { Source: string; Message: string } =>
      typeof e === 'object' && e !== null && typeof (e as { Message?: unknown }).Message === 'string' && 'Source' in e,
    )
    .map((e) => e.Message);
  return new FormDistributionError(rules.length > 0 ? `${what}: ${rules.join(' ')}` : `${what}.`, {
    fault: rules.length === 0,
    logDetail: saveFailure(link),
  });
}

/** The link as it landed — the instance holds what the save and the provisioning hook wrote. */
function linkOf(link: FormDistributionEntityServer): DistributionLink {
  return {
    distributionId: link.ID,
    slug: link.Slug ?? null,
    status: link.Status,
    respondentUrl: respondentUrlOf(link),
  };
}

/**
 * The URL a respondent opens, built by the contracts rule the builder uses too (`respondentUrl`),
 * against `MJAPI_PUBLIC_URL` — the setting the respondent host page and asset URLs are built from.
 * The builder builds against the API it talks to; an operation has no request to read one from.
 */
function respondentUrlOf(link: FormDistributionEntityServer): string | null {
  if (!isOpenToResponses(link) || !link.PublicLinkToken || !link.Slug) {
    return null;
  }
  const base = process.env.MJAPI_PUBLIC_URL?.trim();
  if (!base) {
    LogStatus(
      `[FormDistributionEngine] Share link ${link.ID} is live at /f/${link.Slug}, but MJAPI_PUBLIC_URL is not set, so the ` +
        'server cannot say at which address; returning no respondent URL. Set MJAPI_PUBLIC_URL to the URL this API is reached at.',
    );
    return null;
  }
  return respondentUrl(link.Slug, base);
}
