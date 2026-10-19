/**
 * Editing a form's on-submit steps — the bodies of `FormAutomationEngine.SaveAutomation`, `.Reorder`
 * and `.Remove`. Each runs inside the engine's unit of work, so it lands whole or not at all.
 *
 * The rules are the builder Automate tab's (`automation-tab.component.ts`), stated once here:
 *  - a new step goes one past the HIGHEST DisplayOrder in use (a count collides after a deletion),
 *    and defaults to OnComplete, Sync and continue-on-error;
 *  - an edit that turns the form's own steps on (`dispatchesLegacy` goes from true to false) first
 *    seeds the four legacy built-ins it was running, so adding one step does not silently switch
 *    off the confirmation email — and every edit marks the form's steps authoritative, so removing
 *    the last one means "run nothing", never "run the built-ins again" (bizapps-forms#47);
 *  - a reorder is the complete run order, and Sync steps must precede Async ones (the runner runs
 *    them that way whatever DisplayOrder says, so any other order would be saved and ignored);
 *  - removing a step never deletes its binding: the binding's ledger of written records outlives it.
 *
 * What a caller is told never carries provider or database text; that goes to `logDetail`.
 */
import type { BaseEntity, DatabaseProviderBase, EntityInfo, UserInfo } from '@memberjunction/core';
import {
  LEGACY_ON_SUBMIT_AUTOMATIONS,
  dispatchesLegacy,
  parseConditionalRule,
  parseFieldMappings,
  parseIdentityRule,
  parseMergePolicy,
  quoteSqlString,
  readStoredFormSettings,
  settingsUpdateToMarkAuthoritative,
  type FormsAutomationFields,
  type FormsAutomationPosition,
  type FormsEntityBindingDraft,
  type FormsEntityBindingFields,
  type FormsNewEntityBinding,
  type FormsRemoveAutomationOutput,
  type FormsSaveAutomationInput,
  type FormsSaveAutomationOutput,
  type JSONValue,
  type mjBizAppsFormsFormAutomationEntity,
  type mjBizAppsFormsFormEntityBindingEntity,
} from '@mj-biz-apps/forms-entities';
import { allowedBindingEntities } from '../automation/allowed-entities.js';
import { FormEntityServer } from '../entities/FormEntityServer.js';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { isGuid } from '../shared/guid.js';
import { FormAutomationError } from './automation-errors.js';
import { requireServerEntity, saveFailure } from './engine-guards.js';

type Step = mjBizAppsFormsFormAutomationEntity;
type Binding = mjBizAppsFormsFormEntityBindingEntity;

const TRIGGERS = ['OnComplete', 'OnCompleteOrPartial', 'OnPartial'] as const;
const EXECUTION_MODES = ['Sync', 'Async'] as const;
const TARGET_TYPES = ['Action', 'Agent', 'EntityBinding'] as const;
const BINDING_STATUSES = ['Active', 'Disabled'] as const;
const LEGACY_ACTIONS = 'MJ: Actions';

/** The form an edit is for, and its steps as stored. */
interface FormSteps {
  form: FormEntityServer;
  steps: Step[];
}

/** Create or update one step (and the binding it runs), seeding and marking as the module header says. */
export async function saveAutomation(
  input: FormsSaveAutomationInput,
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<FormsSaveAutomationOutput> {
  const formId = requireId(input?.FormID, 'FormID');
  const draft = input.Automation;
  if (!draft || typeof draft !== 'object') {
    throw new FormAutomationError('An automation step to save is required.');
  }
  const loaded = await loadFormSteps(formId, provider, user);
  if (draft.ID) {
    return updateStep(loaded, input, provider, user);
  }
  return createStep(loaded, input, provider, user);
}

/** Rewrite every step's DisplayOrder to `orderedIds`' order; returns the positions in run order. */
export async function reorderAutomations(
  formId: string,
  orderedIds: readonly string[],
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<FormsAutomationPosition[]> {
  const id = requireId(formId, 'FormID');
  const { steps } = await loadFormSteps(id, provider, user);
  const ordered = stepsInOrder(steps, orderedIds, id);
  const firstAsync = ordered.findIndex((step) => step.ExecutionMode === 'Async');
  if (firstAsync >= 0 && ordered.slice(firstAsync).some((step) => step.ExecutionMode === 'Sync')) {
    throw new FormAutomationError(
      'Every Sync step runs before any Async one, whatever the order says, so an order placing an Async step ahead of a Sync step cannot be saved.',
    );
  }
  for (const [index, step] of ordered.entries()) {
    if (step.DisplayOrder !== index + 1) {
      step.DisplayOrder = index + 1;
      await saveOrRefuse(step, `step ${step.ID}`);
    }
  }
  return ordered.map((step) => ({ FormAutomationID: step.ID, DisplayOrder: step.DisplayOrder }));
}

/** Delete one step, keep its binding, and mark the form's steps authoritative. */
export async function removeAutomation(
  automationId: string,
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<FormsRemoveAutomationOutput> {
  const id = requireId(automationId, 'FormAutomationID');
  const step = await loadStep(id, provider, user);
  const loaded = await loadFormSteps(step.FormID, provider, user);
  const seeded = await ensureFormRunsItsOwnSteps(loaded, provider, user);
  // Read the identity BEFORE deleting: a successful BaseEntity.Delete() resets the object through
  // NewRecord(), so afterwards step.ID is a fresh key and step.FormID is empty.
  const removed = { FormAutomationID: step.ID, FormID: step.FormID, RetainedBindingID: step.BindingID ?? null };
  if (!(await step.Delete())) {
    throw new FormAutomationError(`Could not remove step ${id}.`, { fault: true, logDetail: saveFailure(step) });
  }
  return { ...removed, SeededAutomationIDs: seeded.map((s) => s.ID) };
}

async function createStep(
  loaded: FormSteps,
  input: FormsSaveAutomationInput,
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<FormsSaveAutomationOutput> {
  const draft = input.Automation;
  const name = typeof draft.Name === 'string' ? draft.Name.trim() : '';
  if (!name) {
    throw new FormAutomationError('A new step needs a name.');
  }
  const targetType = choice(draft.TargetType, TARGET_TYPES, 'TargetType');
  if (!targetType) {
    throw new FormAutomationError(`A new step needs a TargetType: one of ${TARGET_TYPES.join(', ')}.`);
  }
  refuseMismatchedTarget(targetType, draft, input.Binding);

  const binding = targetType === 'EntityBinding' ? await createBinding(loaded.form.ID, newBindingOf(input.Binding), provider, user) : null;
  const seeded = await ensureFormRunsItsOwnSteps(loaded, provider, user);
  const step = await newEntity<Step>(FORMS_ENTITY.FormAutomation, provider, user);
  step.FormID = loaded.form.ID;
  step.Name = name;
  step.TargetType = targetType;
  step.BindingID = binding?.ID ?? null;
  // The tab's defaults: OnComplete; Sync, so a later step can rely on what this one produced; and
  // tolerant, so one failing step does not stop the rest.
  step.Trigger = 'OnComplete';
  step.ExecutionMode = 'Sync';
  step.ContinueOnError = true;
  step.IsActive = true;
  step.DisplayOrder = highestOrder([...loaded.steps, ...seeded]) + 1;
  applyStepFields(step, draft);
  await saveOrRefuse(step, `step "${name}"`);
  return {
    FormAutomationID: step.ID,
    FormEntityBindingID: binding?.ID ?? null,
    DisplayOrder: step.DisplayOrder,
    SeededAutomationIDs: seeded.map((s) => s.ID),
  };
}

async function updateStep(
  loaded: FormSteps,
  input: FormsSaveAutomationInput,
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<FormsSaveAutomationOutput> {
  const draft = input.Automation;
  const id = requireId(draft.ID, 'Automation.ID');
  const step = loaded.steps.find((candidate) => sameId(candidate.ID, id));
  if (!step) {
    throw new FormAutomationError(`Step ${id} does not exist on form ${loaded.form.ID}.`);
  }
  if ((draft as { TargetType?: unknown }).TargetType !== undefined) {
    throw new FormAutomationError("A step's TargetType cannot change; remove the step and add another.");
  }
  refuseMismatchedTarget(step.TargetType, draft, input.Binding, true);
  if (input.Binding) {
    await updateBinding(step, input.Binding, provider, user);
  }
  const seeded = await ensureFormRunsItsOwnSteps(loaded, provider, user);
  if (draft.Name !== undefined) {
    const name = typeof draft.Name === 'string' ? draft.Name.trim() : '';
    if (!name) {
      throw new FormAutomationError('A step needs a name.');
    }
    step.Name = name;
  }
  applyStepFields(step, draft);
  await saveOrRefuse(step, `step ${step.ID}`);
  return {
    FormAutomationID: step.ID,
    FormEntityBindingID: step.BindingID ?? null,
    DisplayOrder: step.DisplayOrder,
    SeededAutomationIDs: seeded.map((s) => s.ID),
  };
}

/**
 * What a target type may and must carry. On update only the fields actually given are checked: an
 * omitted ActionID keeps the stored one.
 */
function refuseMismatchedTarget(
  targetType: (typeof TARGET_TYPES)[number],
  draft: FormsAutomationFields,
  binding: FormsEntityBindingDraft | undefined,
  isUpdate = false,
): void {
  const given = (value: string | null | undefined) => typeof value === 'string' && value.trim() !== '';
  if (targetType !== 'EntityBinding' && binding) {
    throw new FormAutomationError('Only an EntityBinding step runs a binding; an Action or Agent step is given none.');
  }
  if (targetType === 'EntityBinding' && !isUpdate && !binding) {
    throw new FormAutomationError('An EntityBinding step needs a binding to run.');
  }
  if (targetType !== 'Action' && given(draft.ActionID)) {
    throw new FormAutomationError(`This ${targetType} step takes no ActionID.`);
  }
  if (targetType !== 'Agent' && given(draft.AgentID)) {
    throw new FormAutomationError(`This ${targetType} step takes no AgentID.`);
  }
  if (!isUpdate && targetType === 'Action' && !given(draft.ActionID)) {
    throw new FormAutomationError('An Action step needs an ActionID.');
  }
  if (!isUpdate && targetType === 'Agent' && !given(draft.AgentID)) {
    throw new FormAutomationError('An Agent step needs an AgentID.');
  }
  if (isUpdate && ((targetType === 'Action' && draft.ActionID === null) || (targetType === 'Agent' && draft.AgentID === null))) {
    throw new FormAutomationError(`This ${targetType} step cannot have its target cleared; remove the step instead.`);
  }
}

/** Copy every field the draft GIVES onto the step, refusing a value the column or the runner cannot hold. */
function applyStepFields(step: Step, draft: FormsAutomationFields): void {
  if (draft.Description !== undefined) {
    step.Description = nullableText(draft.Description, 'Description');
  }
  if (draft.ActionID !== undefined && draft.ActionID !== null) {
    step.ActionID = requireId(draft.ActionID, 'ActionID');
  }
  if (draft.AgentID !== undefined && draft.AgentID !== null) {
    step.AgentID = requireId(draft.AgentID, 'AgentID');
  }
  const trigger = choice(draft.Trigger, TRIGGERS, 'Trigger');
  if (trigger) {
    step.Trigger = trigger;
  }
  const mode = choice(draft.ExecutionMode, EXECUTION_MODES, 'ExecutionMode');
  if (mode) {
    step.ExecutionMode = mode;
  }
  if (draft.ConditionalRule !== undefined) {
    step.ConditionalRule = readableJson(draft.ConditionalRule, 'condition', (text) => parseConditionalRule(text));
  }
  if (draft.ParameterMapping !== undefined) {
    step.ParameterMapping = readableJson(draft.ParameterMapping, 'parameter mapping', (text) => JSON.parse(text));
  }
  if (draft.ContinueOnError !== undefined) {
    step.ContinueOnError = flag(draft.ContinueOnError, 'ContinueOnError');
  }
  if (draft.IsActive !== undefined) {
    step.IsActive = flag(draft.IsActive, 'IsActive');
  }
  if (draft.TimeoutMS !== undefined) {
    if (draft.TimeoutMS !== null && (!Number.isInteger(draft.TimeoutMS) || draft.TimeoutMS < 1)) {
      throw new FormAutomationError('TimeoutMS must be a whole number of milliseconds, at least 1, or null.');
    }
    step.TimeoutMS = draft.TimeoutMS;
  }
}

/** The binding draft as a new binding, or a refusal: a new EntityBinding step creates its binding. */
function newBindingOf(draft: FormsEntityBindingDraft | undefined): FormsNewEntityBinding {
  if (!draft) {
    throw new FormAutomationError('An EntityBinding step needs a binding to run.');
  }
  if (draft.ID) {
    throw new FormAutomationError('A new step creates its own binding; it cannot take over binding ' + draft.ID + '.');
  }
  return draft as FormsNewEntityBinding;
}

async function createBinding(
  formId: string,
  draft: FormsNewEntityBinding,
  provider: DatabaseProviderBase,
  user: UserInfo,
): Promise<Binding> {
  const entity = targetEntity(draft.TargetEntityName, provider);
  const binding = await newEntity<Binding>(FORMS_ENTITY.FormEntityBinding, provider, user);
  binding.FormID = formId;
  binding.TargetEntityID = entity.ID;
  binding.TargetEntityName = entity.Name;
  binding.Name = typeof draft.Name === 'string' && draft.Name.trim() ? draft.Name.trim() : `Send responses to ${entity.DisplayNameOrName ?? entity.Name}`;
  binding.Status = 'Active';
  binding.FieldMappings = bindingJson(draft.FieldMappings, 'field mappings', parseFieldMappings);
  binding.IdentityRule = bindingJson(draft.IdentityRule, 'identity rule', parseIdentityRule);
  binding.MergePolicy = null;
  applyBindingFields(binding, draft);
  await saveOrRefuse(binding, `the binding to ${entity.Name}`);
  return binding;
}

async function updateBinding(step: Step, draft: FormsEntityBindingDraft, provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
  if (!draft.ID) {
    throw new FormAutomationError("A step's binding cannot be replaced; remove the step and add another to write somewhere else.");
  }
  if (!step.BindingID || !sameId(draft.ID, step.BindingID)) {
    throw new FormAutomationError(`Step ${step.ID} does not run binding ${draft.ID}, so it cannot change it.`);
  }
  if ((draft as { TargetEntityName?: unknown }).TargetEntityName !== undefined) {
    throw new FormAutomationError('A binding writes to one entity for life; its TargetEntityName cannot change.');
  }
  const binding = await loadOne<Binding>(FORMS_ENTITY.FormEntityBinding, step.BindingID, provider, user);
  if (!binding) {
    throw new FormAutomationError(`Binding ${step.BindingID} of step ${step.ID} does not exist.`);
  }
  if (draft.Name !== undefined) {
    const name = typeof draft.Name === 'string' ? draft.Name.trim() : '';
    if (!name) {
      throw new FormAutomationError('A binding needs a name.');
    }
    binding.Name = name;
  }
  if (draft.FieldMappings !== undefined) {
    binding.FieldMappings = bindingJson(draft.FieldMappings, 'field mappings', parseFieldMappings);
  }
  if (draft.IdentityRule !== undefined) {
    binding.IdentityRule = bindingJson(draft.IdentityRule, 'identity rule', parseIdentityRule);
  }
  applyBindingFields(binding, draft);
  await saveOrRefuse(binding, `binding ${binding.ID}`);
}

function applyBindingFields(binding: Binding, draft: FormsEntityBindingFields): void {
  if (draft.Description !== undefined) {
    binding.Description = nullableText(draft.Description, 'the binding Description');
  }
  if (draft.MergePolicy !== undefined) {
    binding.MergePolicy =
      draft.MergePolicy === null ? null : bindingJson(draft.MergePolicy, 'merge policy', parseMergePolicy);
  }
  const status = choice(draft.Status, BINDING_STATUSES, 'Status');
  if (status) {
    binding.Status = status;
  }
}

/**
 * The entity a binding writes, by name, or a refusal. Checked against this deployment's binding
 * allow-list too, so an author hears no while authoring rather than a respondent's submission
 * failing later.
 */
function targetEntity(name: unknown, provider: DatabaseProviderBase): EntityInfo {
  const entityName = typeof name === 'string' ? name.trim() : '';
  if (!entityName) {
    throw new FormAutomationError('A binding needs the TargetEntityName it writes to.');
  }
  const entity = provider.EntityByName(entityName);
  if (!entity) {
    throw new FormAutomationError(`This host has no entity named "${entityName}" for a binding to write to.`);
  }
  const allowed = allowedBindingEntities();
  if (allowed && !allowed.has(entity.Name)) {
    throw new FormAutomationError(`Entity "${entity.Name}" is not on this deployment's binding allow-list.`);
  }
  return entity;
}

/**
 * Seed the legacy built-ins when this edit turns the form's own steps on, and mark the form
 * authoritative (idempotently). Returns the seeded steps. Seeded rows keep their legacy order above
 * whatever the form already holds; a built-in this host does not have is skipped, as the legacy
 * runner skipped it.
 */
async function ensureFormRunsItsOwnSteps(loaded: FormSteps, provider: DatabaseProviderBase, user: UserInfo): Promise<Step[]> {
  const settings = readStoredFormSettings(loaded.form.Settings);
  if (!settings.ok) {
    throw new FormAutomationError(`The settings of form ${loaded.form.ID} cannot be read (${settings.reason}), so its steps were not changed.`);
  }
  const seeded = dispatchesLegacy(settings.value, loaded.steps.length) ? await seedLegacySteps(loaded, provider, user) : [];
  const marked = settingsUpdateToMarkAuthoritative(loaded.form.Settings);
  if (marked !== null) {
    loaded.form.Settings = marked;
    await saveOrRefuse(loaded.form, `form ${loaded.form.ID}`);
  }
  return seeded;
}

async function seedLegacySteps(loaded: FormSteps, provider: DatabaseProviderBase, user: UserInfo): Promise<Step[]> {
  const names = LEGACY_ON_SUBMIT_AUTOMATIONS.map((legacy) => quoteSqlString(legacy.actionName)).join(',');
  const read = await provider.RunView<{ ID: string; Name: string }>(
    { EntityName: LEGACY_ACTIONS, ExtraFilter: `Name IN (${names})`, Fields: ['ID', 'Name'], ResultType: 'simple' },
    user,
  );
  if (!read.Success) {
    throw new FormAutomationError('The built-in steps could not be read, so nothing was changed.', {
      fault: true,
      logDetail: read.ErrorMessage || 'no detail',
    });
  }
  const idByName = new Map(read.Results.map((action) => [action.Name, action.ID]));
  const base = highestOrder(loaded.steps);
  const seeded: Step[] = [];
  for (const legacy of LEGACY_ON_SUBMIT_AUTOMATIONS) {
    const actionId = idByName.get(legacy.actionName);
    if (!actionId) {
      continue;
    }
    const step = await newEntity<Step>(FORMS_ENTITY.FormAutomation, provider, user);
    step.FormID = loaded.form.ID;
    step.Name = legacy.actionName;
    step.TargetType = 'Action';
    step.ActionID = actionId;
    step.Trigger = 'OnComplete';
    // Sequential and tolerant, as the legacy runner fired them.
    step.ExecutionMode = 'Sync';
    step.ContinueOnError = true;
    step.IsActive = true;
    step.DisplayOrder = base + legacy.displayOrder;
    await saveOrRefuse(step, `the built-in step "${legacy.actionName}"`);
    seeded.push(step);
  }
  return seeded;
}

/** The steps named by `orderedIds`, in that order — each of the form's steps exactly once, or a refusal. */
function stepsInOrder(steps: Step[], orderedIds: readonly string[], formId: string): Step[] {
  if (!Array.isArray(orderedIds)) {
    throw new FormAutomationError('The new order must be a list of step ids.');
  }
  const ordered = orderedIds.map((id) => steps.find((step) => typeof id === 'string' && sameId(step.ID, id)));
  const distinct = new Set(ordered.filter((step): step is Step => step !== undefined));
  if (ordered.some((step) => step === undefined) || distinct.size !== orderedIds.length || distinct.size !== steps.length) {
    throw new FormAutomationError(
      `The new order must name every step of form ${formId} exactly once (${steps.length} step(s); ${orderedIds.length} id(s) given).`,
    );
  }
  return ordered as Step[];
}

async function loadFormSteps(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormSteps> {
  const [forms, steps] = await provider.RunViews<unknown>(
    [
      { EntityName: FORMS_ENTITY.Form, ExtraFilter: `ID=${quoteSqlString(formId)}`, ResultType: 'entity_object', BypassCache: true },
      {
        EntityName: FORMS_ENTITY.FormAutomation,
        ExtraFilter: `FormID=${quoteSqlString(formId)}`,
        OrderBy: 'DisplayOrder',
        ResultType: 'entity_object',
        BypassCache: true,
      },
    ],
    user,
  );
  if (!forms?.Success || !steps?.Success) {
    throw new FormAutomationError(`Could not read form ${formId} and its steps.`, {
      fault: true,
      logDetail: (forms?.Success ? steps?.ErrorMessage : forms?.ErrorMessage) || 'no detail',
    });
  }
  const [form] = forms.Results;
  if (!form) {
    throw new FormAutomationError(`Form ${formId} does not exist.`);
  }
  return {
    form: requireServerEntity(form, FormEntityServer, FORMS_ENTITY.Form),
    steps: steps.Results as Step[],
  };
}

async function loadStep(id: string, provider: DatabaseProviderBase, user: UserInfo): Promise<Step> {
  const step = await loadOne<Step>(FORMS_ENTITY.FormAutomation, id, provider, user);
  if (!step) {
    throw new FormAutomationError(`Step ${id} does not exist.`);
  }
  return step;
}

/** One row as an entity object, `null` when it does not exist; a failed read throws. */
async function loadOne<T>(entityName: string, id: string, provider: DatabaseProviderBase, user: UserInfo): Promise<T | null> {
  const read = await provider.RunView<T>(
    { EntityName: entityName, ExtraFilter: `ID=${quoteSqlString(id)}`, ResultType: 'entity_object', BypassCache: true },
    user,
  );
  if (!read.Success) {
    throw new FormAutomationError(`Could not read ${id}.`, { fault: true, logDetail: read.ErrorMessage || 'no detail' });
  }
  return read.Results[0] ?? null;
}

async function newEntity<T extends BaseEntity>(entityName: string, provider: DatabaseProviderBase, user: UserInfo): Promise<T> {
  const entity = await provider.GetEntityObject<T>(entityName, user);
  if (!entity) {
    throw new FormAutomationError(`Could not create a ${entityName} row.`, { fault: true });
  }
  entity.NewRecord();
  return entity;
}

async function saveOrRefuse(entity: Pick<BaseEntity, 'Save' | 'LatestResult'>, label: string): Promise<void> {
  if (!(await entity.Save())) {
    throw new FormAutomationError(`Could not save ${label}; nothing was changed.`, { fault: true, logDetail: saveFailure(entity) });
  }
}

function highestOrder(steps: readonly Pick<Step, 'DisplayOrder'>[]): number {
  return steps.reduce((max, step) => Math.max(max, step.DisplayOrder ?? 0), 0);
}

function requireId(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new FormAutomationError(`${field} is required.`);
  }
  if (!isGuid(text)) {
    throw new FormAutomationError(`${field} must be a valid ID.`);
  }
  return text;
}

function sameId(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function choice<T extends string>(value: unknown, choices: readonly T[], field: string): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const found = choices.find((candidate) => candidate === value);
  if (!found) {
    throw new FormAutomationError(`${field} must be one of ${choices.join(', ')}.`);
  }
  return found;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new FormAutomationError(`${field} must be true or false.`);
  }
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || typeof value === 'string') {
    return value;
  }
  throw new FormAutomationError(`${field} must be text or null.`);
}

/**
 * JSON text the runner will read, validated with `read`; `null` clears it. The text is stored as
 * given — the author's — once it is known to read.
 */
function readableJson(value: unknown, what: string, read: (text: string) => unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new FormAutomationError(`The ${what} must be JSON text or null.`);
  }
  try {
    read(value);
  } catch (err) {
    throw new FormAutomationError(`The ${what} cannot be read: ${err instanceof Error ? err.message : String(err)}`);
  }
  return value;
}

/** Binding JSON text, validated with the executor's own strict parser. */
function bindingJson(value: unknown, what: string, parse: (json: JSONValue | null) => unknown): string {
  const text = readableJson(value, `binding's ${what}`, (raw) => parse(JSON.parse(raw) as JSONValue));
  if (text === null) {
    throw new FormAutomationError(`The binding needs its ${what}.`);
  }
  return text;
}
