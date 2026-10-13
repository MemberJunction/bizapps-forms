/**
 * `FormPublishingEngine` — the ONE way a form version becomes Published (spec #303 §4).
 *
 * Publishing used to live in the browser (`forms-ng`'s `publish.service.ts`): the builder built the
 * snapshot from its in-memory tree and wrote it. That made the browser the only place the rule gate
 * and the snapshot builder ran, and the server trusted whatever arrived. Here the server reads the
 * authored rows itself, builds the snapshot with the same contracts builder, and writes it in one
 * transaction — so the builder, an Action, an agent and the approval flow all get the same result
 * from the same call, and `FormVersionEntityServer` / `FormEntityServer` refuse every other writer.
 *
 * The steps, in order, inside one `RunInEntityTransaction`:
 *  1. read the draft (two batched `RunViews`; see {@link readDraft});
 *  2. refuse a template, then any broken rule (`brokenRuleLines`), then anything the strict parsers
 *     cannot read (`buildPublishedAutomations` / `buildPublishedDefinition` throw
 *     `UnreadableColumnError`) — all BEFORE the first write;
 *  3. insert the new version as Draft at `max + 1`, so the database assigns its id;
 *  4. retire the live version(s) — before step 5, because `UQ_FormVersion_OnePublishedPerForm`
 *     allows one Published row per form;
 *  5. promote the new version to Published with its snapshot, which now names the id step 3 got —
 *     the browser's client-minted-id reconcile has nothing left to do;
 *  6. move the form to Published if it is not already.
 * Any failure rolls all of it back: the previous version is still live and still serving.
 */
import {
  LogError,
  type DatabaseProviderBase,
  type RunViewParams,
  type RunViewResult,
  type UserInfo,
} from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import {
  AUTHORED_AUTOMATION_FIELDS,
  AUTHORED_BINDING_FIELDS,
  AUTHORED_OPTION_FIELDS,
  AUTHORED_PAGE_FIELDS,
  AUTHORED_QUESTION_FIELDS,
  AUTHORED_SCREEN_FIELDS,
  AUTHORED_STYLE_FIELDS,
  brokenRuleLines,
  brokenRuleRefusal,
  buildPublishedAutomations,
  buildPublishedDefinition,
  MissingBindingError,
  quoteSqlString,
  UnreadableColumnError,
  type AuthoredAutomationRow,
  type AuthoredBindingRow,
  type AuthoredFormTree,
  type AuthoredOptionRow,
  type AuthoredPageRow,
  type AuthoredQuestionRow,
  type AuthoredScreenRow,
  type AuthoredStyleRow,
  type PublishedFormDefinition,
} from '@mj-biz-apps/forms-entities';
import { FormEntityServer } from '../entities/FormEntityServer.js';
import { FormVersionEntityServer } from '../entities/FormVersionEntityServer.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { requireEntityTransactions, requireServerEntity, runEngineUnitOfWork, saveAsEngine, saveFailure } from './engine-guards.js';

const ENTITY = FORMS_ENTITY;

/**
 * What a concurrent publish of the same form looks like from the losing side.
 *
 * Both publishes read the same highest version number, so the second insert collides on
 * `UQ_FormVersion_Form_VersionNumber` (or, in a narrower window, its promotion on
 * `UQ_FormVersion_OnePublishedPerForm`). The database message names a constraint the author has
 * never heard of; this says what happened and what to do.
 */
export const PUBLISH_IN_PROGRESS_MESSAGE = 'Another publish of this form is in progress; reload and try again.';
const CONCURRENT_PUBLISH_CONSTRAINTS = ['UQ_FormVersion_Form_VersionNumber', 'UQ_FormVersion_OnePublishedPerForm'];

/** What a publish wrote. */
export interface FormPublishResult {
  /** The new version — now the form's one Published version. */
  formVersionId: string;
  versionNumber: number;
  /** The versions this publish moved from Published to Retired (empty on a first publish). */
  retiredVersionIds: string[];
  /** The snapshot as stored in the new version's `DefinitionSnapshot`. */
  definition: PublishedFormDefinition;
}

/**
 * Why a publish did not happen — every failure the engine detects itself, whether over the draft
 * (a broken rule, an unreadable column, a template) or over the system (a read or a write that
 * failed). None of them left anything written: the transaction rolled back.
 */
export class FormPublishError extends Error {
  /**
   * The broken rules a rule-gate refusal was over — absent on every other refusal, because "no
   * rule is broken" and "this refusal was never about rules" are different answers. Carried so a
   * caller can RETRACT the refusal once the author fixes them.
   */
  public readonly brokenRules?: readonly string[];
  /**
   * True when the refusal is the system's fault (a read failed) rather than the draft's — logged
   * as an error, where an authoring refusal is only a status.
   */
  public readonly fault: boolean;

  constructor(message: string, options: { brokenRules?: readonly string[]; fault?: boolean } = {}) {
    super(message);
    this.name = 'FormPublishError';
    this.brokenRules = options.brokenRules;
    this.fault = options.fault === true;
  }
}

/** The draft as publish reads it: the authored tree plus everything the writes need. */
interface PublishDraft {
  form: FormEntityServer;
  tree: AuthoredFormTree;
  style: AuthoredStyleRow | undefined;
  automations: AuthoredAutomationRow[];
  bindings: AuthoredBindingRow[];
  liveVersions: FormVersionEntityServer[];
  nextVersionNumber: number;
}

type QuestionRead = AuthoredQuestionRow & { PageID: string };
type OptionRead = AuthoredOptionRow & { QuestionID: string };

export class FormPublishingEngine extends BaseSingleton<FormPublishingEngine> {
  public static get Instance(): FormPublishingEngine {
    return super.getInstance<FormPublishingEngine>();
  }

  /**
   * Publish the form's current authored structure as a new version. Throws {@link FormPublishError}
   * when it refuses (nothing is written), and any other error when the database does. A failure is
   * logged with the form and the user when this call is the outermost unit of work; inside a
   * caller's transaction the caller logs it (`runEngineUnitOfWork`).
   *
   * Joins the caller's transaction when one is open on `provider` (as a savepoint), which is how
   * `FormAuthoringEngine` builds and publishes a form as one unit of work.
   */
  public async Publish(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormPublishResult> {
    const id = formId?.trim() ?? '';
    if (!id) {
      throw new FormPublishError('A form id is required to publish.');
    }
    if (!user) {
      throw new FormPublishError(`Publishing form ${id} needs the acting user; none was given.`);
    }
    requireEntityTransactions(provider, `Publishing form ${id}`);
    return runEngineUnitOfWork(provider, `[FormPublishingEngine] form ${id} was not published (user ${user.ID})`, () =>
      this.publishInTransaction(id, provider, user),
    );
  }

  private async publishInTransaction(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormPublishResult> {
    const draft = await this.readDraft(formId, provider, user);
    const definition = this.buildSnapshot(draft);

    const version = await this.insertDraftVersion(formId, draft.nextVersionNumber, provider, user);
    const retiredVersionIds = await this.retire(draft.liveVersions);
    const published: PublishedFormDefinition = { ...definition, formVersionId: version.ID };
    await this.promote(version, published);
    await this.markFormPublished(draft.form);

    return { formVersionId: version.ID, versionNumber: version.VersionNumber, retiredVersionIds, definition: published };
  }

  /**
   * Every gate, in the order an author fixes things, and then the snapshot — all before any write.
   * The snapshot is built with a placeholder version id; {@link publishInTransaction} substitutes
   * the real one once the row exists.
   */
  private buildSnapshot(draft: PublishDraft): PublishedFormDefinition {
    if (draft.form.IsTemplate) {
      throw new FormPublishError(
        `Form ${draft.form.ID} is a template, and templates are never published. Create a form from it and publish that.`,
      );
    }
    const broken = brokenRuleLines(draft.tree);
    if (broken.length > 0) {
      throw new FormPublishError(brokenRuleRefusal(broken), { brokenRules: broken });
    }
    try {
      const automations = buildPublishedAutomations(draft.automations, draft.bindings);
      return buildPublishedDefinition(draft.tree, draft.style, '', automations);
    } catch (err) {
      if (err instanceof UnreadableColumnError || err instanceof MissingBindingError) {
        throw new FormPublishError(`${err.message} Nothing was published.`);
      }
      throw err;
    }
  }

  /**
   * Read the draft in two batches. Everything keyed by the form id goes in the first; the options
   * (keyed by question) and the style (keyed by the form's `StyleID`) go in the second, because
   * neither is addressable until the first has answered — a subquery would fold them into one
   * call, at the price of dialect-specific schema quoting inside a filter.
   *
   * Every read is fresh (`BypassCache`) and, inside the transaction, reads what this unit of work
   * has written. A failed read refuses: publishing around a gap (no automations, no live version to
   * retire, version 1 again) is a silent downgrade. The one exception is the style, which degrades
   * to the defaults exactly as the builder's publish did — a theme is not worth a refusal.
   */
  private async readDraft(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<PublishDraft> {
    const byForm = `FormID=${quoteSqlString(formId)}`;
    const [forms, pages, questions, screens, automations, bindings, live, numbers] = await provider.RunViews<unknown>(
      [
        entityRead(ENTITY.Form, `ID=${quoteSqlString(formId)}`),
        simpleRead(ENTITY.FormPage, byForm, AUTHORED_PAGE_FIELDS),
        simpleRead(ENTITY.FormQuestion, byForm, [...AUTHORED_QUESTION_FIELDS, 'PageID']),
        simpleRead(ENTITY.FormScreen, byForm, AUTHORED_SCREEN_FIELDS),
        simpleRead(ENTITY.FormAutomation, byForm, AUTHORED_AUTOMATION_FIELDS),
        simpleRead(ENTITY.FormEntityBinding, byForm, AUTHORED_BINDING_FIELDS),
        entityRead(ENTITY.FormVersion, `${byForm} AND Status='Published'`),
        // Every version's number, not `ORDER BY … MaxRows 1`: a form has few versions, and the max
        // computed here does not depend on how the provider orders a capped read.
        simpleRead(ENTITY.FormVersion, byForm, ['VersionNumber']),
      ],
      user,
    );
    const formRows = rowsOrRefuse(forms, `the form ${formId}`);
    if (formRows.length === 0) {
      throw new FormPublishError(`Form ${formId} does not exist, so it cannot be published.`);
    }
    const form = requireServerEntity(formRows[0], FormEntityServer, ENTITY.Form);
    const questionRows = rowsOrRefuse<QuestionRead>(questions, 'the form\'s questions');
    const [options, style] = await this.readQuestionOptionsAndStyle(form, questionRows, provider, user);
    const versionNumbers = rowsOrRefuse<{ VersionNumber: number }>(numbers, 'the form\'s versions').map((v) => v.VersionNumber);
    const pageRows = rowsOrRefuse<AuthoredPageRow>(pages, 'the form\'s pages');
    const screenRows = rowsOrRefuse<AuthoredScreenRow>(screens, 'the form\'s screens');
    return {
      form,
      tree: assembleTree(form, pageRows, questionRows, options, screenRows),
      style,
      automations: rowsOrRefuse<AuthoredAutomationRow>(automations, 'the form\'s automations'),
      bindings: rowsOrRefuse<AuthoredBindingRow>(bindings, 'the form\'s automations (their bindings)'),
      liveVersions: rowsOrRefuse(live, 'the form\'s live versions').map((version) =>
        requireServerEntity(version, FormVersionEntityServer, ENTITY.FormVersion),
      ),
      nextVersionNumber: Math.max(0, ...versionNumbers) + 1,
    };
  }

  private async readQuestionOptionsAndStyle(
    form: FormEntityServer,
    questions: readonly QuestionRead[],
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<[OptionRead[], AuthoredStyleRow | undefined]> {
    const reads: RunViewParams[] = [];
    if (questions.length > 0) {
      const questionIds = questions.map((q) => quoteSqlString(q.ID)).join(',');
      reads.push(simpleRead(ENTITY.FormQuestionOption, `QuestionID IN (${questionIds})`, [...AUTHORED_OPTION_FIELDS, 'QuestionID']));
    }
    if (form.StyleID) {
      reads.push(simpleRead(ENTITY.FormStyle, `ID=${quoteSqlString(form.StyleID)}`, AUTHORED_STYLE_FIELDS));
    }
    if (reads.length === 0) {
      return [[], undefined];
    }
    const results = await provider.RunViews<unknown>(reads, user);
    const options = questions.length > 0 ? rowsOrRefuse<OptionRead>(results.shift(), 'the form\'s answer options') : [];
    return [options, form.StyleID ? styleOrDefault(results.shift(), form.StyleID, form.ID) : undefined];
  }

  /** Step 3: the new version, as Draft, so the database gives it an id before the snapshot names it. */
  private async insertDraftVersion(
    formId: string,
    versionNumber: number,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<FormVersionEntityServer> {
    const version = requireServerEntity(
      await provider.GetEntityObject(ENTITY.FormVersion, user),
      FormVersionEntityServer,
      ENTITY.FormVersion,
    );
    version.NewRecord();
    version.FormID = formId;
    version.VersionNumber = versionNumber;
    version.Status = 'Draft';
    await saveVersion(version, `insert version ${versionNumber}`);
    return version;
  }

  /** Step 4. Returns the ids retired. */
  private async retire(liveVersions: readonly FormVersionEntityServer[]): Promise<string[]> {
    const retired: string[] = [];
    for (const incumbent of liveVersions) {
      incumbent.Status = 'Retired';
      await saveVersion(incumbent, `retire version ${incumbent.VersionNumber}`, saveAsEngine);
      retired.push(incumbent.ID);
    }
    return retired;
  }

  /** Step 5. */
  private async promote(version: FormVersionEntityServer, definition: PublishedFormDefinition): Promise<void> {
    version.DefinitionSnapshot = JSON.stringify(definition);
    version.Status = 'Published';
    version.PublishedAt = new Date();
    await saveVersion(version, `publish version ${version.VersionNumber}`, saveAsEngine);
  }

  /** Step 6. A republish leaves an already-Published form untouched. */
  private async markFormPublished(form: FormEntityServer): Promise<void> {
    if (form.Status === 'Published') {
      return;
    }
    form.Status = 'Published';
    if (!(await saveAsEngine(form))) {
      throw new FormPublishError(`Could not mark form ${form.ID} Published: ${saveFailure(form)}. Nothing was published.`, {
        fault: true,
      });
    }
  }
}

/**
 * A fresh `simple` read of the named columns. Fresh because a publish must see the rows as they are
 * now — and, inside its transaction, as this unit of work has written them — never a cached copy.
 */
function simpleRead(entityName: string, filter: string, fields: readonly string[]): RunViewParams {
  return { EntityName: entityName, ExtraFilter: filter, Fields: [...fields], ResultType: 'simple', BypassCache: true };
}

/** A fresh read of whole entity objects — for the rows publish writes back (the form, the live versions). */
function entityRead(entityName: string, filter: string): RunViewParams {
  return { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true };
}

/** Save a version, translating a concurrent-publish collision into words an author can act on. */
async function saveVersion(
  version: FormVersionEntityServer,
  step: string,
  save: (entity: FormVersionEntityServer) => Promise<boolean> = (entity) => entity.Save(),
): Promise<void> {
  if (await save(version)) {
    return;
  }
  const why = saveFailure(version);
  if (CONCURRENT_PUBLISH_CONSTRAINTS.some((constraint) => why.includes(constraint))) {
    throw new FormPublishError(PUBLISH_IN_PROGRESS_MESSAGE);
  }
  throw new FormPublishError(`Could not ${step} of form ${version.FormID}: ${why}. Nothing was published.`, { fault: true });
}

/**
 * A view's rows, or a refusal naming what could not be read.
 *
 * The one place a `RunViews` result is narrowed to its row type: the provider's batch call carries
 * a single type parameter for every view in the batch, and each call site above names the row
 * shape its `Fields` list asked for.
 */
function rowsOrRefuse<T = unknown>(result: RunViewResult<unknown> | undefined, what: string): T[] {
  if (!result?.Success) {
    throw new FormPublishError(
      `Could not read ${what} (${result?.ErrorMessage || 'no result'}); nothing was published.`,
      { fault: true },
    );
  }
  return (result.Results ?? []) as T[];
}

/** The linked style, or the defaults — logged — when it cannot be read. */
function styleOrDefault(result: RunViewResult<unknown> | undefined, styleId: string, formId: string): AuthoredStyleRow | undefined {
  if (!result?.Success) {
    LogError(
      `[FormPublishingEngine] form ${formId}: style ${styleId} could not be read (${result?.ErrorMessage || 'no result'}); ` +
        'publishing with the default style.',
    );
    return undefined;
  }
  const [style] = (result.Results ?? []) as AuthoredStyleRow[];
  if (!style) {
    LogError(`[FormPublishingEngine] form ${formId}: style ${styleId} does not exist; publishing with the default style.`);
  }
  return style;
}

/**
 * The flat rows as the tree the contracts builder and rule gate take. Ids are compared
 * case-insensitively: SQL Server returns uniqueidentifiers upper-case, and a foreign key written by
 * a client may not be.
 */
function assembleTree(
  form: FormEntityServer,
  pages: readonly AuthoredPageRow[],
  questions: readonly QuestionRead[],
  options: readonly OptionRead[],
  screens: readonly AuthoredScreenRow[],
): AuthoredFormTree {
  const key = (id: string): string => id.toLowerCase();
  const optionsByQuestion = groupBy(options, (o) => key(o.QuestionID));
  const questionsByPage = groupBy(questions, (q) => key(q.PageID));
  return {
    form,
    pages: pages.map((page) => ({
      entity: page,
      questions: (questionsByPage.get(key(page.ID)) ?? []).map((question) => ({
        entity: question,
        options: optionsByQuestion.get(key(question.ID)) ?? [],
      })),
    })),
    screens,
  };
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    const group = groups.get(k);
    if (group) {
      group.push(item);
    } else {
      groups.set(k, [item]);
    }
  }
  return groups;
}
