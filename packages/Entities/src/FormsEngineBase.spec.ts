import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BaseEntityEvent,
  IMetadataProvider,
  RunViewParams,
  RunViewResult,
  UserInfo,
} from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';

const { logError, runViewsCalls, runViewsHandler } = vi.hoisted(() => ({
  logError: vi.fn(),
  runViewsCalls: [] as { provider: unknown; params: RunViewParams[]; user: UserInfo | undefined }[],
  runViewsHandler: {
    current: async (
      _provider: unknown,
      params: RunViewParams[],
      _user: UserInfo | undefined,
    ): Promise<RunViewResult[]> =>
      params.map(() => ({
        Success: true,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: '',
      })),
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();

  class MockRunView {
    public constructor(private readonly provider: unknown = null) {}
    public static FromMetadataProvider(provider: IMetadataProvider): MockRunView {
      return new MockRunView(provider);
    }
    public async RunViews<T = unknown>(
      params: RunViewParams[],
      contextUser?: UserInfo,
    ): Promise<RunViewResult<T>[]> {
      runViewsCalls.push({ provider: this.provider, params, user: contextUser });
      return (await runViewsHandler.current(this.provider, params, contextUser)) as RunViewResult<T>[];
    }
    public async RunView<T = unknown>(
      params: RunViewParams,
      contextUser?: UserInfo,
    ): Promise<RunViewResult<T>> {
      const [first] = await this.RunViews<T>([params], contextUser);
      return first;
    }
  }

  return {
    ...actual,
    LogError: logError,
    RunView: MockRunView,
  };
});

import { BaseEntity } from '@memberjunction/core';
import {
  DEFAULT_MAX_CACHED_FORM_DEFINITIONS,
  FORMS_ENGINE_ENTITY_NAMES,
  FormsEngineBase,
} from './FormsEngineBase';
import type {
  mjBizAppsFormsFormCategoryEntity,
  mjBizAppsFormsFormStyleEntity,
} from './generated/entity_subclasses';

function makeUser(id: string): UserInfo {
  return { ID: id, Name: `User ${id}`, Email: `${id}@example.com` } as unknown as UserInfo;
}

function makeProvider(options: {
  id?: string;
  user?: UserInfo;
  unreadableEntities?: readonly string[];
} = {}): IMetadataProvider {
  const blocked = new Set((options.unreadableEntities ?? []).map((n) => n.toLowerCase()));
  return {
    __providerId: options.id ?? 'provider-default',
    CurrentUser: options.user ?? makeUser('user-1'),
    EntityByName: (name: string) => ({
      Name: name,
      GetUserPermisions: (_user: UserInfo) => ({
        CanRead: !blocked.has(name.toLowerCase()),
        CanCreate: false,
        CanUpdate: false,
        CanDelete: false,
      }),
    }),
  } as unknown as IMetadataProvider;
}

function okResult<T>(rows: T[]): RunViewResult<T> {
  return {
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 0,
    ErrorMessage: '',
  };
}

function failResult(message: string): RunViewResult {
  return {
    Success: false,
    Results: [],
    RowCount: 0,
    TotalRowCount: 0,
    ExecutionTime: 0,
    ErrorMessage: message,
  };
}

function fakeCategory(overrides: Partial<mjBizAppsFormsFormCategoryEntity>): mjBizAppsFormsFormCategoryEntity {
  return {
    ID: 'cat-1',
    Name: 'General',
    ParentID: null,
    DisplayRank: 1,
    IsActive: true,
    ...overrides,
  } as mjBizAppsFormsFormCategoryEntity;
}

function fakeStyle(overrides: Partial<mjBizAppsFormsFormStyleEntity>): mjBizAppsFormsFormStyleEntity {
  return {
    ID: 'style-1',
    Name: 'Ocean',
    DisplayRank: 1,
    IsActive: true,
    CSSVariables: '{}',
    CustomCSS: null,
    LogoURL: null,
    ...overrides,
  } as mjBizAppsFormsFormStyleEntity;
}

/**
 * Helper to invoke BaseEngine.Load via a spy on the singleton without hitting a real DB.
 * Populates `_formCategories` / `_formStyles` on the engine and marks it loaded.
 */
function stubEngineLoad(
  engine: FormsEngineBase,
  data: {
    categories?: mjBizAppsFormsFormCategoryEntity[];
    styles?: mjBizAppsFormsFormStyleEntity[];
  },
) {
  const loadCalls: {
    configs: readonly { PropertyName?: string; EntityName?: string; CacheLocal?: boolean }[];
    provider: IMetadataProvider | undefined;
    forceRefresh: boolean | undefined;
    user: UserInfo | undefined;
  }[] = [];

  const spy = vi.spyOn(
    engine as unknown as {
      Load: (
        configs: readonly { PropertyName?: string; EntityName?: string; CacheLocal?: boolean }[],
        provider?: IMetadataProvider,
        forceRefresh?: boolean,
        contextUser?: UserInfo,
      ) => Promise<void>;
    },
    'Load',
  ).mockImplementation(async (configs, provider, forceRefresh, contextUser) => {
    loadCalls.push({ configs, provider, forceRefresh, user: contextUser });
    const internal = engine as unknown as Record<string, unknown>;
    internal['_loaded'] = true;
    internal['_dataMap'] = new Map<string, unknown[]>();
    for (const cfg of configs) {
      if (cfg.PropertyName === '_formCategories') {
        const rows = data.categories ?? [];
        internal['_formCategories'] = rows;
        (internal['_dataMap'] as Map<string, unknown[]>).set('_formCategories', rows);
      }
      if (cfg.PropertyName === '_formStyles') {
        const rows = data.styles ?? [];
        internal['_formStyles'] = rows;
        (internal['_dataMap'] as Map<string, unknown[]>).set('_formStyles', rows);
      }
    }
    await (engine as unknown as { AdditionalLoading: (u?: UserInfo) => Promise<void> }).AdditionalLoading(contextUser);
  });

  return { loadCalls, spy };
}

function raiseBaseEntityEvent(event: BaseEntityEvent): void {
  MJGlobal.Instance.RaiseEvent({
    component: {},
    event: MJEventType.ComponentEvent,
    eventCode: BaseEntity.BaseEventCode,
    args: event,
  });
}

describe('FormsEngineBase', () => {
  const engine = FormsEngineBase.Instance;

  beforeEach(() => {
    logError.mockReset();
    runViewsCalls.length = 0;
    engine.InvalidateCache();
    engine.MaxCachedFormDefinitions = DEFAULT_MAX_CACHED_FORM_DEFINITIONS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    engine.InvalidateCache();
  });

  describe('taxonomy caching, O(1) lookups, ProviderToUse, CanRead, and user switching', () => {
    it('loads Form Categories and Form Styles with CacheLocal: true and provides O(1) indexed lookups', async () => {
      const rootCat = fakeCategory({ ID: 'CAT-ROOT', Name: 'Intake', ParentID: null, DisplayRank: 2, IsActive: true });
      const childCat = fakeCategory({ ID: 'CAT-CHILD', Name: 'HR Intake', ParentID: 'cat-root', DisplayRank: 1, IsActive: true });
      const inactiveCat = fakeCategory({ ID: 'CAT-OLD', Name: 'Legacy', ParentID: null, DisplayRank: 0, IsActive: false });

      const presetB = fakeStyle({ ID: 'STYLE-B', Name: 'Slate', DisplayRank: 2, IsActive: true });
      const presetA = fakeStyle({ ID: 'STYLE-A', Name: 'Ocean', DisplayRank: 1, IsActive: true });
      const customClone = fakeStyle({ ID: 'STYLE-CLONE', Name: 'Custom Form Theme', DisplayRank: 0, IsActive: true });

      const { loadCalls } = stubEngineLoad(engine, {
        categories: [rootCat, childCat, inactiveCat],
        styles: [presetB, presetA, customClone],
      });

      const user = makeUser('user-a');
      const provider = makeProvider({ id: 'p-1', user });
      await engine.Config(false, user, provider);

      expect(loadCalls).toHaveLength(1);
      expect(loadCalls[0].configs).toEqual([
        expect.objectContaining({
          PropertyName: '_formCategories',
          EntityName: FORMS_ENGINE_ENTITY_NAMES.FormCategory,
          CacheLocal: true,
        }),
        expect.objectContaining({
          PropertyName: '_formStyles',
          EntityName: FORMS_ENGINE_ENTITY_NAMES.FormStyle,
          CacheLocal: true,
        }),
      ]);
      expect(engine.ProviderToUse).toBe(provider);
      expect(engine.IsConfiguredForUser('USER-A')).toBe(true);
      expect(engine.IsConfiguredForUser('user-b')).toBe(false);

      // O(1) case-insensitive lookups
      expect(engine.FormCategoryById('cat-root')?.Name).toBe('Intake');
      expect(engine.FormCategoriesByParentId('CAT-ROOT').map((c) => c.ID)).toEqual(['CAT-CHILD']);
      expect(engine.FormCategoriesByParentId(null).map((c) => c.ID)).toEqual(['CAT-ROOT', 'CAT-OLD']);
      expect(engine.ActiveFormCategories.map((c) => c.ID)).toEqual(['CAT-CHILD', 'CAT-ROOT']);

      expect(engine.FormStyleById('style-a')?.Name).toBe('Ocean');
      expect(engine.FormStyleByName('  ocean  ')?.ID).toBe('STYLE-A');
      expect(engine.GalleryFormStyles.map((s) => s.ID)).toEqual(['STYLE-A', 'STYLE-B']);
    });

    it('gates unreadable entities via CanRead so restricted principals never fail Config()', async () => {
      const { loadCalls } = stubEngineLoad(engine, {
        categories: [fakeCategory({ ID: 'cat-1' })],
        styles: [fakeStyle({ ID: 'style-1' })],
      });

      const respondent = makeUser('anon-respondent');
      const provider = makeProvider({
        user: respondent,
        unreadableEntities: [FORMS_ENGINE_ENTITY_NAMES.FormCategory, FORMS_ENGINE_ENTITY_NAMES.FormStyle],
      });

      await engine.Config(false, respondent, provider);

      expect(loadCalls[0].configs).toEqual([]);
      expect(engine.FormCategories).toEqual([]);
      expect(engine.FormStyles).toEqual([]);
      expect(engine.FormCategoryById('cat-1')).toBeUndefined();
      expect(engine.FormStyleById('style-1')).toBeUndefined();
    });

    it('updates ProviderToUse and forces refresh + clears definition cache on user switch', async () => {
      const { loadCalls } = stubEngineLoad(engine, {
        categories: [fakeCategory({ ID: 'cat-1' })],
        styles: [],
      });

      const userA = makeUser('user-a');
      const userB = makeUser('user-b');
      const providerA = makeProvider({ id: 'p-a', user: userA });
      const providerB = makeProvider({ id: 'p-b', user: userB });

      await engine.Config(false, userA, providerA);
      expect(engine.ProviderToUse).toBe(providerA);
      expect(loadCalls[0].forceRefresh).toBe(true); // first load after InvalidateCache()

      // Same user, not forced -> forceRefresh false
      await engine.Config(false, userA, providerA);
      expect(loadCalls[1].forceRefresh).toBe(false);

      // Populate a form definition under userA
      runViewsHandler.current = async (_p, params) =>
        params.map((q) =>
          q.EntityName === FORMS_ENGINE_ENTITY_NAMES.Form
            ? okResult([{ ID: 'form-1', Name: 'Survey' }])
            : okResult([]),
        );
      await engine.GetFormDefinition('form-1', { contextUser: userA, provider: providerA });
      expect(engine.CachedFormDefinitionCount).toBe(1);

      // Switch to userB on providerB -> ProviderToUse switches, forceRefresh true, definition cache cleared
      await engine.Config(false, userB, providerB);
      expect(engine.ProviderToUse).toBe(providerB);
      expect(loadCalls[2].forceRefresh).toBe(true);
      expect(engine.CachedFormDefinitionCount).toBe(0);
      expect(engine.IsConfiguredForUser('user-b')).toBe(true);
      expect(engine.IsConfiguredForUser('user-a')).toBe(false);
    });
  });

  describe('ConversationEngine-style bounded per-FormID definition cache', () => {
    it('loads Form + Pages + Questions + Screens + Automations + Bindings in 1 batched RunViews (+ options batch)', async () => {
      const user = makeUser('user-1');
      const provider = makeProvider({ id: 'p-def', user });

      runViewsHandler.current = async (_p, params) =>
        params.map((q) => {
          switch (q.EntityName) {
            case FORMS_ENGINE_ENTITY_NAMES.Form:
              return okResult([{ ID: 'FORM-1', Name: 'Feedback' }]);
            case FORMS_ENGINE_ENTITY_NAMES.FormPage:
              return okResult([{ ID: 'page-1', FormID: 'FORM-1', DisplayOrder: 0 }]);
            case FORMS_ENGINE_ENTITY_NAMES.FormQuestion:
              return okResult([
                { ID: 'Q-1', FormID: 'FORM-1', PageID: 'page-1', QuestionType: 'SingleChoice', Prompt: 'Rating?', DisplayOrder: 0 },
              ]);
            case FORMS_ENGINE_ENTITY_NAMES.FormQuestionOption:
              return okResult([
                { ID: 'opt-2', QuestionID: 'q-1', Label: 'Good', DisplayOrder: 2 },
                { ID: 'opt-1', QuestionID: 'q-1', Label: 'Great', DisplayOrder: 1 },
              ]);
            case FORMS_ENGINE_ENTITY_NAMES.FormScreen:
              return okResult([{ ID: 'scr-1', FormID: 'FORM-1', ScreenType: 'Welcome', DisplayOrder: 0 }]);
            case FORMS_ENGINE_ENTITY_NAMES.FormAutomation:
              return okResult([{ ID: 'auto-1', FormID: 'FORM-1', DisplayOrder: 1 }]);
            case FORMS_ENGINE_ENTITY_NAMES.FormEntityBinding:
              return okResult([{ ID: 'bind-1', FormID: 'FORM-1' }]);
            default:
              return okResult([]);
          }
        });

      const def = await engine.GetFormDefinition('FORM-1', { contextUser: user, provider });
      expect(def).not.toBeNull();
      expect(def?.form.Name).toBe('Feedback');
      expect(def?.pages).toHaveLength(1);
      expect(def?.questions).toHaveLength(1);
      expect(def?.screens).toHaveLength(1);
      expect(def?.automations).toHaveLength(1);
      expect(def?.bindings).toHaveLength(1);
      expect(def?.optionsByQuestionId.get('q-1')?.map((o) => o.Label)).toEqual(['Great', 'Good']);
      expect(def?.questionsById.get('q-1')?.Prompt).toBe('Rating?');

      // Batch 1: 6 FormID-keyed queries in ONE RunViews call; Batch 2: options via QuestionID IN (...)
      expect(runViewsCalls).toHaveLength(2);
      expect(runViewsCalls[0].provider).toBe(provider);
      expect(runViewsCalls[0].params.map((p) => p.EntityName)).toEqual([
        FORMS_ENGINE_ENTITY_NAMES.Form,
        FORMS_ENGINE_ENTITY_NAMES.FormPage,
        FORMS_ENGINE_ENTITY_NAMES.FormQuestion,
        FORMS_ENGINE_ENTITY_NAMES.FormScreen,
        FORMS_ENGINE_ENTITY_NAMES.FormAutomation,
        FORMS_ENGINE_ENTITY_NAMES.FormEntityBinding,
      ]);
      expect(runViewsCalls[1].params[0].EntityName).toBe(FORMS_ENGINE_ENTITY_NAMES.FormQuestionOption);

      // Cache hit with different UUID casing -> zero extra RunViews calls
      const hit = await engine.GetFormDefinition('form-1', { contextUser: user, provider });
      expect(hit).toBe(def);
      expect(runViewsCalls).toHaveLength(2);
    });

    it('deduplicates concurrent in-flight GetFormDefinition requests for the same FormID', async () => {
      const user = makeUser('user-1');
      const provider = makeProvider({ user });
      let resolveBatch!: () => void;
      const gate = new Promise<void>((r) => {
        resolveBatch = r;
      });

      runViewsHandler.current = async (_p, params) => {
        await gate;
        return params.map((q) =>
          q.EntityName === FORMS_ENGINE_ENTITY_NAMES.Form
            ? okResult([{ ID: 'form-dedup', Name: 'Dedup' }])
            : okResult([]),
        );
      };

      const p1 = engine.GetFormDefinition('form-dedup', { contextUser: user, provider, includeOptions: false });
      const p2 = engine.GetFormDefinition('FORM-DEDUP', { contextUser: user, provider, includeOptions: false });
      resolveBatch();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      expect(runViewsCalls).toHaveLength(1);
    });

    it('enforces bounded LRU eviction when MaxCachedFormDefinitions is exceeded', async () => {
      const user = makeUser('user-1');
      const provider = makeProvider({ user });
      engine.MaxCachedFormDefinitions = 2;

      runViewsHandler.current = async (_p, params) => {
        const filter = String(params[0]?.ExtraFilter ?? '');
        const match = /ID='([^']+)'/.exec(filter);
        const id = match?.[1] ?? 'unknown';
        return params.map((q) =>
          q.EntityName === FORMS_ENGINE_ENTITY_NAMES.Form ? okResult([{ ID: id, Name: id }]) : okResult([]),
        );
      };

      await engine.GetFormDefinition('form-a', { contextUser: user, provider, includeOptions: false });
      await engine.GetFormDefinition('form-b', { contextUser: user, provider, includeOptions: false });
      // Touch form-a so form-b becomes LRU
      await engine.GetFormDefinition('form-a', { contextUser: user, provider, includeOptions: false });
      // Load form-c -> evicts form-b
      await engine.GetFormDefinition('form-c', { contextUser: user, provider, includeOptions: false });

      expect(engine.CachedFormDefinitionCount).toBe(2);
      expect(engine.PeekFormDefinition('form-a')).toBeDefined();
      expect(engine.PeekFormDefinition('form-b')).toBeUndefined();
      expect(engine.PeekFormDefinition('form-c')).toBeDefined();
    });

    it('gates unreadable child entities with CanRead inside GetFormDefinition', async () => {
      const runner = makeUser('automation-runner');
      const provider = makeProvider({
        user: runner,
        unreadableEntities: [FORMS_ENGINE_ENTITY_NAMES.FormPage, FORMS_ENGINE_ENTITY_NAMES.FormScreen],
      });

      runViewsHandler.current = async (_p, params) =>
        params.map((q) =>
          q.EntityName === FORMS_ENGINE_ENTITY_NAMES.Form ? okResult([{ ID: 'form-r', Name: 'Runner Form' }]) : okResult([]),
        );

      const def = await engine.GetFormDefinition('form-r', { contextUser: runner, provider, includeOptions: false });
      expect(def?.form.ID).toBe('form-r');
      const queriedEntities = runViewsCalls[0].params.map((p) => p.EntityName);
      expect(queriedEntities).not.toContain(FORMS_ENGINE_ENTITY_NAMES.FormPage);
      expect(queriedEntities).not.toContain(FORMS_ENGINE_ENTITY_NAMES.FormScreen);
      expect(queriedEntities).toContain(FORMS_ENGINE_ENTITY_NAMES.FormQuestion);
    });

    it('invalidates targeted FormID on BaseEntityEvent saves/deletes for Form, child entities, and QuestionOptions', async () => {
      const user = makeUser('user-1');
      const provider = makeProvider({ user });

      runViewsHandler.current = async (_p, params) => {
        const firstFilter = String(params[0]?.ExtraFilter ?? '');
        const formId = /ID='([^']+)'/.exec(firstFilter)?.[1] ?? 'form-1';
        return params.map((q) => {
          if (q.EntityName === FORMS_ENGINE_ENTITY_NAMES.Form) {
            return okResult([{ ID: formId, Name: formId }]);
          }
          if (q.EntityName === FORMS_ENGINE_ENTITY_NAMES.FormQuestion) {
            return okResult([{ ID: `q-${formId}`, FormID: formId, DisplayOrder: 0 }]);
          }
          return okResult([]);
        });
      };

      await engine.GetFormDefinition('form-1', { contextUser: user, provider });
      await engine.GetFormDefinition('form-2', { contextUser: user, provider });
      expect(engine.CachedFormDefinitionCount).toBe(2);

      // 1. Child save on Form Questions for form-1 -> evicts ONLY form-1
      raiseBaseEntityEvent({
        type: 'save',
        baseEntity: {
          EntityInfo: { Name: FORMS_ENGINE_ENTITY_NAMES.FormQuestion },
          GetAll: () => ({ ID: 'q-form-1', FormID: 'form-1' }),
        } as unknown as BaseEntity,
        payload: null,
      });
      expect(engine.PeekFormDefinition('form-1')).toBeUndefined();
      expect(engine.PeekFormDefinition('form-2')).toBeDefined();

      // Reload form-1, then save a Form Question Option for q-form-2 -> evicts ONLY form-2 via reverse index
      await engine.GetFormDefinition('form-1', { contextUser: user, provider });
      raiseBaseEntityEvent({
        type: 'save',
        baseEntity: {
          EntityInfo: { Name: FORMS_ENGINE_ENTITY_NAMES.FormQuestionOption },
          GetAll: () => ({ ID: 'opt-1', QuestionID: 'q-form-2' }),
        } as unknown as BaseEntity,
        payload: null,
      });
      expect(engine.PeekFormDefinition('form-1')).toBeDefined();
      expect(engine.PeekFormDefinition('form-2')).toBeUndefined();

      // 3. remote-invalidate with null payload (from announceWrites) -> clears remaining cache safely
      raiseBaseEntityEvent({
        type: 'remote-invalidate',
        baseEntity: null,
        entityName: FORMS_ENGINE_ENTITY_NAMES.Form,
        payload: null,
      });
      expect(engine.CachedFormDefinitionCount).toBe(0);
    });

    it('returns null and logs without caching when the Form RunView fails', async () => {
      const user = makeUser('user-1');
      const provider = makeProvider({ user });

      runViewsHandler.current = async (_p, params) => params.map(() => failResult('permission denied'));

      const def = await engine.GetFormDefinition('form-fail', { contextUser: user, provider, includeOptions: false });
      expect(def).toBeNull();
      expect(engine.CachedFormDefinitionCount).toBe(0);
      expect(logError).toHaveBeenCalled();
    });
  });
});
