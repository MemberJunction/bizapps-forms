import {
  BaseEngine,
  type BaseEnginePropertyConfig,
  type BaseEntityEvent,
  type IMetadataProvider,
  LogError,
  Metadata,
  RegisterForStartup,
  RunView,
  type RunViewParams,
  type RunViewResult,
  type UserInfo,
} from '@memberjunction/core';
import { quoteSqlString } from './contracts/sql-literal';
import type {
  mjBizAppsFormsFormAutomationEntityType,
  mjBizAppsFormsFormCategoryEntity,
  mjBizAppsFormsFormEntityBindingEntityType,
  mjBizAppsFormsFormEntityType,
  mjBizAppsFormsFormPageEntityType,
  mjBizAppsFormsFormQuestionEntityType,
  mjBizAppsFormsFormQuestionOptionEntityType,
  mjBizAppsFormsFormScreenEntityType,
  mjBizAppsFormsFormStyleEntity,
} from './generated/entity_subclasses';

/** Canonical entity names managed or observed by {@link FormsEngineBase}. */
export const FORMS_ENGINE_ENTITY_NAMES = {
  FormCategory: 'MJ_BizApps_Forms: Form Categories',
  FormStyle: 'MJ_BizApps_Forms: Form Styles',
  Form: 'MJ_BizApps_Forms: Forms',
  FormPage: 'MJ_BizApps_Forms: Form Pages',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  FormQuestionOption: 'MJ_BizApps_Forms: Form Question Options',
  FormScreen: 'MJ_BizApps_Forms: Form Screens',
  FormAutomation: 'MJ_BizApps_Forms: Form Automations',
  FormEntityBinding: 'MJ_BizApps_Forms: Form Entity Bindings',
} as const;

/** Default LRU capacity for the bounded per-`FormID` definition cache. */
export const DEFAULT_MAX_CACHED_FORM_DEFINITIONS = 50;

/** Maximum IDs per `IN (...)` predicate chunk for RLS-safe two-step option reads. */
const OPTION_IN_CHUNK_SIZE = 200;

const normalizeKey = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

const FORM_DEFINITION_CHILD_ENTITIES: ReadonlySet<string> = new Set([
  normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormPage),
  normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormQuestion),
  normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormScreen),
  normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormAutomation),
  normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormEntityBinding),
]);

const TAXONOMY_ENTITIES: ReadonlySet<string> = new Set([
  normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormCategory),
  normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormStyle),
]);

/** Options for {@link FormsEngineBase.GetFormDefinition}. */
export interface GetFormDefinitionOptions {
  /** Bypass any cached entry and reload from the provider. */
  forceRefresh?: boolean;
  /** User context for server-side or impersonated reads. Defaults to `ProviderToUse.CurrentUser`. */
  contextUser?: UserInfo;
  /** Explicit provider override (defaults to `this.ProviderToUse`). */
  provider?: IMetadataProvider;
  /**
   * Whether to also load `Form Question Options` for the form's questions (default `true`).
   * Pass `false` when the caller only needs pages/questions/screens/automations/bindings.
   */
  includeOptions?: boolean;
}

/**
 * Bounded structural definition for a single form (`FormID`), loaded via one batched `RunViews`
 * call (plus one chunked RLS-safe `QuestionID IN (...)` batch for options when questions exist).
 *
 * Strictly structural metadata — NEVER includes unbounded transactional tables such as
 * `Form Responses`, `Form Response Answers`, `Form Automation Runs`, `Form Automation Events`,
 * `Form Entity Binding Records`, or `Form Uploads`.
 */
export interface CachedFormDefinition {
  readonly formId: string;
  readonly form: mjBizAppsFormsFormEntityType;
  readonly pages: readonly mjBizAppsFormsFormPageEntityType[];
  readonly questions: readonly mjBizAppsFormsFormQuestionEntityType[];
  readonly options: readonly mjBizAppsFormsFormQuestionOptionEntityType[];
  readonly optionsLoaded: boolean;
  readonly screens: readonly mjBizAppsFormsFormScreenEntityType[];
  readonly automations: readonly mjBizAppsFormsFormAutomationEntityType[];
  readonly bindings: readonly mjBizAppsFormsFormEntityBindingEntityType[];
  /** O(1) case-insensitive question lookup by `Question.ID`. */
  readonly questionsById: ReadonlyMap<string, mjBizAppsFormsFormQuestionEntityType>;
  /** O(1) case-insensitive options lookup by `QuestionID`, sorted by `DisplayOrder`. */
  readonly optionsByQuestionId: ReadonlyMap<string, readonly mjBizAppsFormsFormQuestionOptionEntityType[]>;
  /** Epoch milliseconds when this entry was populated. */
  readonly loadedAt: number;
}

interface EntityKeyBag {
  ID?: string | null;
  FormID?: string | null;
  QuestionID?: string | null;
}

interface RemoteInvalidatePayload {
  recordData?: EntityKeyBag | null;
  primaryKey?: {
    KeyValuePairs?: ReadonlyArray<{ FieldName?: string; Value?: string | number | null }>;
  } | null;
}

interface InFlightDefinitionRequest {
  readonly promise: Promise<CachedFormDefinition | null>;
  readonly includesOptions: boolean;
}

/**
 * Browser- and server-safe metadata & bounded form-definition cache engine for MJ Forms.
 *
 * Responsibilities:
 * 1. **Shared non-RLS taxonomy caching (`CacheLocal: true`)**: caches `MJ_BizApps_Forms: Form Categories`
 *    and `MJ_BizApps_Forms: Form Styles` with O(1) indexed lookups, `CanRead` permission gating
 *    (so restricted principals like `Form Respondent` and `Forms Automation Runner` never fail
 *    `Config()`), active `ProviderToUse` routing, and automatic user-switch invalidation.
 * 2. **`ConversationEngine`-style bounded per-`FormID` definition cache**: caches a single form's
 *    bounded structural definition (`Form`, `Form Pages`, `Form Questions`, `Form Question Options`,
 *    `Form Screens`, `Form Automations`, `Form Entity Bindings`) with LRU eviction (default max 50
 *    forms), in-flight promise deduplication, user-switch clearing, and automatic invalidation on
 *    `BaseEntityEvent` saves/deletes/remote-invalidations.
 *
 * Unbounded transactional tables (`Form Responses`, `Form Response Answers`, `Form Automation Runs`,
 * `Form Automation Events`, `Form Entity Binding Records`, `Form Uploads`) are NEVER cached here.
 */
@RegisterForStartup()
export class FormsEngineBase extends BaseEngine<FormsEngineBase> {
  private _formCategories: mjBizAppsFormsFormCategoryEntity[] = [];
  private _formStyles: mjBizAppsFormsFormStyleEntity[] = [];

  private _formCategoriesById: Map<string, mjBizAppsFormsFormCategoryEntity> | null = null;
  private _formCategoriesByParentId: Map<string, mjBizAppsFormsFormCategoryEntity[]> | null = null;
  private _formStylesById: Map<string, mjBizAppsFormsFormStyleEntity> | null = null;
  private _formStylesByName: Map<string, mjBizAppsFormsFormStyleEntity> | null = null;

  private _formCategoriesReadable = true;
  private _formStylesReadable = true;
  private _loadedForUserId: string | null = null;
  private _cacheInvalidated = false;
  private _activeProvider: IMetadataProvider | null = null;

  /** Bounded LRU cache keyed by normalized `FormID`. Insertion order tracks recency. */
  private _formDefinitions = new Map<string, CachedFormDefinition>();
  /** In-flight deduplication map keyed by normalized `FormID`. */
  private _inFlightFormDefinitions = new Map<string, InFlightDefinitionRequest>();
  /** Reverse index from normalized `QuestionID` -> normalized `FormID` for option-event invalidation. */
  private _questionIdToFormId = new Map<string, string>();
  /** User ID that owns the current `_formDefinitions` cache entries. */
  private _formDefinitionCacheUserId: string | null = null;
  /** Monotonic generation counter to discard stale in-flight loads across invalidations. */
  private _formDefinitionGeneration = 0;
  /** Per-form invalidation counter so targeted invalidations discard stale in-flight fetches. */
  private _perFormGeneration = new Map<string, number>();

  /** Maximum number of form definitions retained in the LRU cache. */
  public MaxCachedFormDefinitions: number = DEFAULT_MAX_CACHED_FORM_DEFINITIONS;

  protected constructor() {
    super();
  }

  public static get Instance(): FormsEngineBase {
    return super.getInstance<FormsEngineBase>();
  }

  /**
   * Always routes RunViews through the active provider passed to `Config()` (or live
   * `Metadata.Provider` in browser sessions) instead of BaseEngine's first-wins `_provider`
   * latch — essential for multi-provider and impersonation safety.
   */
  public override get ProviderToUse(): IMetadataProvider {
    return this._activeProvider ?? Metadata.Provider;
  }

  /**
   * Loads shared non-RLS Forms taxonomy tables (`Form Categories` and `Form Styles`)
   * with `CanRead` gating, active-provider routing, and automatic user-switch invalidation.
   */
  public async Config(
    forceRefresh?: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    this._activeProvider = provider ?? null;
    const md = this.ProviderToUse;
    if (!md) {
      return;
    }
    const effectiveUser = contextUser ?? md.CurrentUser;
    const nextUserId = normalizeKey(effectiveUser?.ID);
    const userChanged =
      this._loadedForUserId !== null &&
      nextUserId.length > 0 &&
      this._loadedForUserId !== nextUserId;
    const shouldForceRefresh = Boolean(forceRefresh || this._cacheInvalidated || userChanged);

    if (userChanged || this._cacheInvalidated) {
      this.ClearFormDefinitionCache();
    }

    const categoriesReadable = this.canReadEntity(FORMS_ENGINE_ENTITY_NAMES.FormCategory, md, effectiveUser);
    const stylesReadable = this.canReadEntity(FORMS_ENGINE_ENTITY_NAMES.FormStyle, md, effectiveUser);
    this._formCategoriesReadable = categoriesReadable;
    this._formStylesReadable = stylesReadable;

    const params: Array<Partial<BaseEnginePropertyConfig>> = [];
    if (categoriesReadable) {
      params.push({
        PropertyName: '_formCategories',
        EntityName: FORMS_ENGINE_ENTITY_NAMES.FormCategory,
        CacheLocal: true,
        AutoRefresh: true,
      });
    } else {
      this._formCategories = [];
    }

    if (stylesReadable) {
      params.push({
        PropertyName: '_formStyles',
        EntityName: FORMS_ENGINE_ENTITY_NAMES.FormStyle,
        CacheLocal: true,
        AutoRefresh: true,
      });
    } else {
      this._formStyles = [];
    }

    await this.Load(params, md, shouldForceRefresh, effectiveUser);
    this._loadedForUserId = nextUserId || null;
    this._formDefinitionCacheUserId = nextUserId || null;
    this._cacheInvalidated = false;
  }

  protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
    this.resetLookupIndexes();
  }

  /**
   * Clears O(1) lookup maps, cached taxonomy arrays, provider binding, and the bounded
   * per-`FormID` definition cache so the next `Config()` or `GetFormDefinition()` reloads fresh.
   */
  public InvalidateCache(): void {
    this._cacheInvalidated = true;
    this._loadedForUserId = null;
    this._activeProvider = null;
    this._formCategories = [];
    this._formStyles = [];
    this.resetLookupIndexes();
    this.ClearFormDefinitionCache();
  }

  /** Returns true when this engine has loaded for `userId` and has not been invalidated. */
  public IsConfiguredForUser(userId: string | null | undefined): boolean {
    if (!this.Loaded || this._cacheInvalidated) {
      return false;
    }
    const norm = normalizeKey(userId);
    if (!norm) {
      return this._loadedForUserId !== null;
    }
    return this._loadedForUserId === norm;
  }

  // ---------------------------------------------------------------------------
  // Taxonomy getters & O(1) indexed lookups
  // ---------------------------------------------------------------------------

  /** All cached `MJ_BizApps_Forms: Form Categories` rows (empty if unreadable). */
  public get FormCategories(): readonly mjBizAppsFormsFormCategoryEntity[] {
    if (!this._formCategoriesReadable) {
      return [];
    }
    return this.GetConfigData<mjBizAppsFormsFormCategoryEntity>('_formCategories');
  }

  /** Active form categories sorted by `DisplayRank`, then `Name`. */
  public get ActiveFormCategories(): readonly mjBizAppsFormsFormCategoryEntity[] {
    return [...this.FormCategories]
      .filter((c) => c.IsActive)
      .sort((a, b) => (a.DisplayRank ?? 0) - (b.DisplayRank ?? 0) || (a.Name ?? '').localeCompare(b.Name ?? ''));
  }

  /** O(1) case-insensitive lookup of a form category by `ID`. */
  public FormCategoryById(id: string | null | undefined): mjBizAppsFormsFormCategoryEntity | undefined {
    const key = normalizeKey(id);
    if (!key) {
      return undefined;
    }
    this.ensureFormCategoryMaps();
    return this._formCategoriesById?.get(key);
  }

  /**
   * O(1) lookup of child categories for `parentId`. Pass `null` or `undefined` to retrieve
   * root categories (`ParentID == null`).
   */
  public FormCategoriesByParentId(parentId: string | null | undefined): readonly mjBizAppsFormsFormCategoryEntity[] {
    const key = normalizeKey(parentId);
    this.ensureFormCategoryMaps();
    return this._formCategoriesByParentId?.get(key) ?? [];
  }

  /** All cached `MJ_BizApps_Forms: Form Styles` rows (empty if unreadable). */
  public get FormStyles(): readonly mjBizAppsFormsFormStyleEntity[] {
    if (!this._formStylesReadable) {
      return [];
    }
    return this.GetConfigData<mjBizAppsFormsFormStyleEntity>('_formStyles');
  }

  /**
   * Selectable preset gallery styles (`IsActive` and `DisplayRank > 0`), sorted by
   * `DisplayRank`, then `Name`. Excludes per-form clones (`DisplayRank === 0`).
   */
  public get GalleryFormStyles(): readonly mjBizAppsFormsFormStyleEntity[] {
    return [...this.FormStyles]
      .filter((s) => s.IsActive && (s.DisplayRank ?? 0) > 0)
      .sort((a, b) => (a.DisplayRank ?? 0) - (b.DisplayRank ?? 0) || (a.Name ?? '').localeCompare(b.Name ?? ''));
  }

  /** O(1) case-insensitive lookup of a form style by `ID`. */
  public FormStyleById(id: string | null | undefined): mjBizAppsFormsFormStyleEntity | undefined {
    const key = normalizeKey(id);
    if (!key) {
      return undefined;
    }
    this.ensureFormStyleMaps();
    return this._formStylesById?.get(key);
  }

  /** O(1) case-insensitive lookup of a form style by trimmed `Name`. */
  public FormStyleByName(name: string | null | undefined): mjBizAppsFormsFormStyleEntity | undefined {
    const key = normalizeKey(name);
    if (!key) {
      return undefined;
    }
    this.ensureFormStyleMaps();
    return this._formStylesByName?.get(key);
  }

  // ---------------------------------------------------------------------------
  // Bounded per-FormID definition cache (ConversationEngine pattern)
  // ---------------------------------------------------------------------------

  /** Number of form definitions currently held in the bounded LRU cache. */
  public get CachedFormDefinitionCount(): number {
    return this._formDefinitions.size;
  }

  /** Synchronously inspect a cached form definition without issuing any I/O. */
  public PeekFormDefinition(formId: string | null | undefined): CachedFormDefinition | undefined {
    const key = normalizeKey(formId);
    if (!key) {
      return undefined;
    }
    return this._formDefinitions.get(key);
  }

  /**
   * Loads (or returns from the bounded LRU cache) a single form's structural definition:
   * `Form`, `Form Pages`, `Form Questions`, `Form Screens`, `Form Automations`, `Form Entity Bindings`,
   * and (unless `includeOptions: false`) `Form Question Options`.
   *
   * Uses a single batched `RunViews` call for all `FormID`-keyed slices via
   * `RunView.FromMetadataProvider(provider)`, followed by a chunked RLS-safe `QuestionID IN (...)`
   * batch for options when questions exist. Deduplicates concurrent in-flight requests, clears on
   * user switch, evicts least-recently-used entries past `MaxCachedFormDefinitions`, and
   * automatically invalidates on `BaseEntityEvent` saves/deletes/remote-invalidations.
   */
  public async GetFormDefinition(
    formId: string,
    options: GetFormDefinitionOptions = {},
  ): Promise<CachedFormDefinition | null> {
    const trimmedId = (formId ?? '').trim();
    const key = normalizeKey(trimmedId);
    if (!key) {
      return null;
    }

    const md = options.provider ?? this.ProviderToUse;
    const effectiveUser = options.contextUser ?? md?.CurrentUser;
    const nextUserId = normalizeKey(effectiveUser?.ID);

    if (
      this._formDefinitionCacheUserId !== null &&
      nextUserId.length > 0 &&
      this._formDefinitionCacheUserId !== nextUserId
    ) {
      this.ClearFormDefinitionCache();
    }
    if (nextUserId.length > 0) {
      this._formDefinitionCacheUserId = nextUserId;
    }

    // Ensure BaseEntityEvent listener is active even when GetFormDefinition is called before Config().
    await this.SetupGlobalEventListener();

    const wantOptions = options.includeOptions !== false;

    if (!options.forceRefresh) {
      const cached = this._formDefinitions.get(key);
      if (cached && (!wantOptions || cached.optionsLoaded)) {
        // Bump to most-recently-used position in the Map.
        this._formDefinitions.delete(key);
        this._formDefinitions.set(key, cached);
        return cached;
      }

      const inFlight = this._inFlightFormDefinitions.get(key);
      if (inFlight && (!wantOptions || inFlight.includesOptions)) {
        return inFlight.promise;
      }
    }

    const cacheGen = this._formDefinitionGeneration;
    const formGen = this._perFormGeneration.get(key) ?? 0;

    const loadPromise = this.fetchFormDefinition(trimmedId, wantOptions, md, effectiveUser).then(
      (definition) => {
        const currentInFlight = this._inFlightFormDefinitions.get(key);
        if (currentInFlight?.promise === loadPromise) {
          this._inFlightFormDefinitions.delete(key);
        }

        // Discard if cache or this specific form was invalidated while the load was in flight.
        if (
          definition &&
          this._formDefinitionGeneration === cacheGen &&
          (this._perFormGeneration.get(key) ?? 0) === formGen
        ) {
          this.storeFormDefinition(key, definition);
        }
        return definition;
      },
      (err: unknown) => {
        const currentInFlight = this._inFlightFormDefinitions.get(key);
        if (currentInFlight?.promise === loadPromise) {
          this._inFlightFormDefinitions.delete(key);
        }
        LogError(
          `FormsEngineBase.GetFormDefinition failed for form ${trimmedId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return null;
      },
    );

    this._inFlightFormDefinitions.set(key, { promise: loadPromise, includesOptions: wantOptions });
    return loadPromise;
  }

  /** Evict a single form's cached definition and mark any in-flight fetch for it as stale. */
  public InvalidateFormDefinition(formId: string | null | undefined): void {
    const key = normalizeKey(formId);
    if (!key) {
      return;
    }
    this._perFormGeneration.set(key, (this._perFormGeneration.get(key) ?? 0) + 1);
    this._inFlightFormDefinitions.delete(key);
    const existing = this._formDefinitions.get(key);
    if (existing) {
      this.removeQuestionReverseEntries(existing);
      this._formDefinitions.delete(key);
    }
  }

  /** Clear every cached form definition, reverse index, and in-flight fetch. */
  public ClearFormDefinitionCache(): void {
    this._formDefinitionGeneration += 1;
    this._formDefinitions.clear();
    this._inFlightFormDefinitions.clear();
    this._questionIdToFormId.clear();
    this._perFormGeneration.clear();
    this._formDefinitionCacheUserId = null;
  }

  // ---------------------------------------------------------------------------
  // BaseEntityEvent invalidation (local save/delete + remote-invalidate)
  // ---------------------------------------------------------------------------

  protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
    const rawName = event.baseEntity?.EntityInfo?.Name ?? event.entityName;
    const normalizedName = normalizeKey(rawName);

    if (normalizedName) {
      if (TAXONOMY_ENTITIES.has(normalizedName)) {
        this.resetLookupIndexes();
      } else {
        this.handleFormDefinitionEvent(normalizedName, event);
      }
    }

    return super.HandleIndividualBaseEntityEvent(event);
  }

  private handleFormDefinitionEvent(normalizedEntityName: string, event: BaseEntityEvent): void {
    if (this._formDefinitions.size === 0 && this._inFlightFormDefinitions.size === 0) {
      return;
    }

    const isMutation =
      event.type === 'save' || event.type === 'delete' || event.type === 'remote-invalidate';
    if (!isMutation) {
      return;
    }

    if (normalizedEntityName === normalizeKey(FORMS_ENGINE_ENTITY_NAMES.Form)) {
      const formId = extractEntityField(event, 'ID') ?? extractPrimaryKeyId(event);
      if (formId) {
        this.InvalidateFormDefinition(formId);
      } else {
        this.ClearFormDefinitionCache();
      }
      return;
    }

    if (FORM_DEFINITION_CHILD_ENTITIES.has(normalizedEntityName)) {
      const formId = extractEntityField(event, 'FormID');
      if (formId) {
        this.InvalidateFormDefinition(formId);
      } else {
        this.ClearFormDefinitionCache();
      }
      return;
    }

    if (normalizedEntityName === normalizeKey(FORMS_ENGINE_ENTITY_NAMES.FormQuestionOption)) {
      const questionId = extractEntityField(event, 'QuestionID');
      const owningFormId = questionId ? this._questionIdToFormId.get(normalizeKey(questionId)) : undefined;
      if (owningFormId) {
        this.InvalidateFormDefinition(owningFormId);
      } else {
        this.ClearFormDefinitionCache();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private canReadEntity(
    entityName: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | undefined,
  ): boolean {
    const entityInfo = provider?.EntityByName(entityName);
    if (!entityInfo || !user) {
      return true;
    }
    return entityInfo.GetUserPermisions(user)?.CanRead !== false;
  }

  private resetLookupIndexes(): void {
    this._formCategoriesById = null;
    this._formCategoriesByParentId = null;
    this._formStylesById = null;
    this._formStylesByName = null;
  }

  private ensureFormCategoryMaps(): void {
    if (!this._formCategoriesById || !this._formCategoriesByParentId) {
      const byId = new Map<string, mjBizAppsFormsFormCategoryEntity>();
      const byParent = new Map<string, mjBizAppsFormsFormCategoryEntity[]>();
      for (const cat of this.FormCategories) {
        if (cat.ID) {
          byId.set(normalizeKey(cat.ID), cat);
        }
        const parentKey = normalizeKey(cat.ParentID);
        const list = byParent.get(parentKey) ?? [];
        list.push(cat);
        byParent.set(parentKey, list);
      }
      this._formCategoriesById = byId;
      this._formCategoriesByParentId = byParent;
    }
  }

  private ensureFormStyleMaps(): void {
    if (!this._formStylesById || !this._formStylesByName) {
      const byId = new Map<string, mjBizAppsFormsFormStyleEntity>();
      const byName = new Map<string, mjBizAppsFormsFormStyleEntity>();
      for (const style of this.FormStyles) {
        if (style.ID) {
          byId.set(normalizeKey(style.ID), style);
        }
        const nameKey = normalizeKey(style.Name);
        if (nameKey) {
          byName.set(nameKey, style);
        }
      }
      this._formStylesById = byId;
      this._formStylesByName = byName;
    }
  }

  private async fetchFormDefinition(
    formId: string,
    includeOptions: boolean,
    provider: IMetadataProvider,
    user: UserInfo | undefined,
  ): Promise<CachedFormDefinition | null> {
    if (!this.canReadEntity(FORMS_ENGINE_ENTITY_NAMES.Form, provider, user)) {
      return null;
    }

    const rv = RunView.FromMetadataProvider(provider);
    const quotedFormId = quoteSqlString(formId);
    const byForm = `FormID=${quotedFormId}`;

    const queries: RunViewParams[] = [
      {
        EntityName: FORMS_ENGINE_ENTITY_NAMES.Form,
        ExtraFilter: `ID=${quotedFormId}`,
        MaxRows: 1,
        ResultType: 'simple',
      },
    ];

    const slotIndex: {
      pages?: number;
      questions?: number;
      screens?: number;
      automations?: number;
      bindings?: number;
    } = {};

    const addSlice = (
      slot: keyof typeof slotIndex,
      entityName: string,
      orderBy?: string,
    ): void => {
      if (!this.canReadEntity(entityName, provider, user)) {
        return;
      }
      slotIndex[slot] = queries.length;
      queries.push({
        EntityName: entityName,
        ExtraFilter: byForm,
        ...(orderBy ? { OrderBy: orderBy } : {}),
        ResultType: 'simple',
      });
    };

    addSlice('pages', FORMS_ENGINE_ENTITY_NAMES.FormPage, 'DisplayOrder ASC');
    addSlice('questions', FORMS_ENGINE_ENTITY_NAMES.FormQuestion, 'DisplayOrder ASC');
    addSlice('screens', FORMS_ENGINE_ENTITY_NAMES.FormScreen, 'DisplayOrder ASC');
    addSlice('automations', FORMS_ENGINE_ENTITY_NAMES.FormAutomation, 'DisplayOrder ASC');
    addSlice('bindings', FORMS_ENGINE_ENTITY_NAMES.FormEntityBinding);

    const results = await rv.RunViews(queries, user);
    const formResult = results[0] as RunViewResult<mjBizAppsFormsFormEntityType> | undefined;
    if (!formResult?.Success) {
      LogError(
        `FormsEngineBase.GetFormDefinition: failed to read Form ${formId}: ${
          formResult?.ErrorMessage ?? 'unknown error'
        }`,
      );
      return null;
    }

    const form = formResult.Results?.[0];
    if (!form) {
      return null;
    }

    const pages = readSlice<mjBizAppsFormsFormPageEntityType>(
      results,
      slotIndex.pages,
      FORMS_ENGINE_ENTITY_NAMES.FormPage,
      formId,
    );
    const questions = readSlice<mjBizAppsFormsFormQuestionEntityType>(
      results,
      slotIndex.questions,
      FORMS_ENGINE_ENTITY_NAMES.FormQuestion,
      formId,
    );
    const screens = readSlice<mjBizAppsFormsFormScreenEntityType>(
      results,
      slotIndex.screens,
      FORMS_ENGINE_ENTITY_NAMES.FormScreen,
      formId,
    );
    const automations = readSlice<mjBizAppsFormsFormAutomationEntityType>(
      results,
      slotIndex.automations,
      FORMS_ENGINE_ENTITY_NAMES.FormAutomation,
      formId,
    );
    const bindings = readSlice<mjBizAppsFormsFormEntityBindingEntityType>(
      results,
      slotIndex.bindings,
      FORMS_ENGINE_ENTITY_NAMES.FormEntityBinding,
      formId,
    );

    let options: mjBizAppsFormsFormQuestionOptionEntityType[] = [];
    let optionsLoaded = false;
    if (includeOptions) {
      if (questions.length === 0 || !this.canReadEntity(FORMS_ENGINE_ENTITY_NAMES.FormQuestionOption, provider, user)) {
        optionsLoaded = true;
      } else {
        const optionLoad = await this.fetchOptionsForQuestions(rv, questions, formId, user);
        options = optionLoad.rows;
        optionsLoaded = optionLoad.ok;
      }
    }

    const questionsById = new Map<string, mjBizAppsFormsFormQuestionEntityType>();
    for (const q of questions) {
      if (q.ID) {
        questionsById.set(normalizeKey(q.ID), q);
      }
    }

    const optionsByQuestionId = new Map<string, mjBizAppsFormsFormQuestionOptionEntityType[]>();
    for (const opt of options) {
      const qKey = normalizeKey(opt.QuestionID);
      if (!qKey) {
        continue;
      }
      const list = optionsByQuestionId.get(qKey) ?? [];
      list.push(opt);
      optionsByQuestionId.set(qKey, list);
    }
    for (const list of optionsByQuestionId.values()) {
      list.sort((a, b) => (a.DisplayOrder ?? 0) - (b.DisplayOrder ?? 0));
    }

    return {
      formId: form.ID,
      form,
      pages,
      questions,
      options,
      optionsLoaded,
      screens,
      automations,
      bindings,
      questionsById,
      optionsByQuestionId,
      loadedAt: Date.now(),
    };
  }

  private async fetchOptionsForQuestions(
    rv: RunView,
    questions: readonly mjBizAppsFormsFormQuestionEntityType[],
    formId: string,
    user: UserInfo | undefined,
  ): Promise<{ ok: boolean; rows: mjBizAppsFormsFormQuestionOptionEntityType[] }> {
    const questionIds = Array.from(new Set(questions.map((q) => q.ID).filter((id): id is string => Boolean(id))));
    if (questionIds.length === 0) {
      return { ok: true, rows: [] };
    }

    // RLS-safe two-step chunked IN(...) batch — never a raw SQL subquery over another entity's view.
    const optionQueries: RunViewParams[] = [];
    for (let i = 0; i < questionIds.length; i += OPTION_IN_CHUNK_SIZE) {
      const chunk = questionIds.slice(i, i + OPTION_IN_CHUNK_SIZE);
      optionQueries.push({
        EntityName: FORMS_ENGINE_ENTITY_NAMES.FormQuestionOption,
        ExtraFilter: `QuestionID IN (${chunk.map(quoteSqlString).join(',')})`,
        OrderBy: 'DisplayOrder ASC',
        ResultType: 'simple',
      });
    }

    const optionResults = await rv.RunViews<mjBizAppsFormsFormQuestionOptionEntityType>(optionQueries, user);
    const rows: mjBizAppsFormsFormQuestionOptionEntityType[] = [];
    let allSucceeded = true;
    for (const res of optionResults) {
      if (!res?.Success) {
        allSucceeded = false;
        LogError(
          `FormsEngineBase.GetFormDefinition: failed to read options for form ${formId}: ${
            res?.ErrorMessage ?? 'unknown error'
          }`,
        );
        continue;
      }
      rows.push(...(res.Results ?? []));
    }
    return { ok: allSucceeded, rows };
  }

  private storeFormDefinition(key: string, definition: CachedFormDefinition): void {
    const maxCap = Math.max(1, this.MaxCachedFormDefinitions);
    const existing = this._formDefinitions.get(key);
    if (existing) {
      this.removeQuestionReverseEntries(existing);
      this._formDefinitions.delete(key);
    }

    while (this._formDefinitions.size >= maxCap) {
      const oldestKey = this._formDefinitions.keys().next().value;
      if (!oldestKey) {
        break;
      }
      const evicted = this._formDefinitions.get(oldestKey);
      if (evicted) {
        this.removeQuestionReverseEntries(evicted);
      }
      this._formDefinitions.delete(oldestKey);
    }

    this._formDefinitions.set(key, definition);
    for (const qKey of definition.questionsById.keys()) {
      this._questionIdToFormId.set(qKey, key);
    }
  }

  private removeQuestionReverseEntries(definition: CachedFormDefinition): void {
    for (const qKey of definition.questionsById.keys()) {
      this._questionIdToFormId.delete(qKey);
    }
  }
}

function readSlice<T>(
  results: readonly RunViewResult[],
  index: number | undefined,
  entityName: string,
  formId: string,
): T[] {
  if (index === undefined) {
    return [];
  }
  const res = results[index] as RunViewResult<T> | undefined;
  if (!res?.Success) {
    LogError(
      `FormsEngineBase.GetFormDefinition: failed to read ${entityName} for form ${formId}: ${
        res?.ErrorMessage ?? 'unknown error'
      }`,
    );
    return [];
  }
  return res.Results ?? [];
}

function extractEntityField(event: BaseEntityEvent, fieldName: keyof EntityKeyBag): string | undefined {
  if (event.baseEntity) {
    const data = event.baseEntity.GetAll() as EntityKeyBag;
    const value = data[fieldName];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  const payload = event.payload as RemoteInvalidatePayload | null | undefined;
  const recordValue = payload?.recordData?.[fieldName];
  if (typeof recordValue === 'string' && recordValue.trim().length > 0) {
    return recordValue.trim();
  }
  return undefined;
}

function extractPrimaryKeyId(event: BaseEntityEvent): string | undefined {
  const localPairs = event.baseEntity?.PrimaryKey?.KeyValuePairs;
  if (localPairs) {
    const idPair = localPairs.find((kv) => normalizeKey(kv.FieldName) === 'id');
    if (idPair && idPair.Value !== null && idPair.Value !== undefined) {
      const text = String(idPair.Value).trim();
      if (text.length > 0) {
        return text;
      }
    }
  }
  const payload = event.payload as RemoteInvalidatePayload | null | undefined;
  const remotePairs = payload?.primaryKey?.KeyValuePairs;
  if (remotePairs) {
    const idPair = remotePairs.find((kv) => normalizeKey(kv.FieldName) === 'id');
    if (idPair && idPair.Value !== null && idPair.Value !== undefined) {
      const text = String(idPair.Value).trim();
      if (text.length > 0) {
        return text;
      }
    }
  }
  return undefined;
}
