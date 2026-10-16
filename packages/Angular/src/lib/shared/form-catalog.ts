/**
 * The Forms catalog: which `Form` rows are forms, which are templates, and what a list of either
 * shows.
 *
 * A saved template is a `Form` row with `IsTemplate = 1` — a copy of a form, made by
 * `Forms.CloneForm` — so every list over Forms has to pick a side, and three surfaces did it
 * separately: the Forms home grid (forms only), the template gallery (templates only) and the
 * builder's "Saved as template" indicator (the template copied FROM this form). This module is the
 * one place that knows the rule. Plain reads only; every write is a Remote Operation (deleting a
 * template is `Forms.DeleteTemplate`).
 *
 * Each read takes the `RunView` it reads through — a fresh one by default — so a
 * spec can hand it a fake.
 */
import { LogError, RunView, type RunViewResult } from '@memberjunction/core';
import { escapeSqlString, quoteSqlString, type mjBizAppsFormsFormEntity, type mjBizAppsFormsFormEntityType } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';
import { loadCompleteResponseCounts } from './complete-response-counts';
import { toDate } from './runview-dates';

type Reader = Pick<RunView, 'RunView' | 'RunViews'>;

/** The `Forms` columns a listing reads. */
export interface FormListRecord {
  ID: string;
  Name: string;
  Status: mjBizAppsFormsFormEntityType['Status'];
  CategoryID: string | null;
  __mj_UpdatedAt: Date | string | null;
}

/** The `Form Categories` columns a listing reads, for naming a form's category. */
export interface FormCategoryRecord {
  ID: string;
  Name: string;
}

/** Every working form (never a template), its categories, and its Complete-response counts. */
export interface FormListing {
  forms: FormListRecord[];
  categories: FormCategoryRecord[];
  /** `null` when the counts could not be read — every count is then unknown, never zero. */
  counts: Map<string, number> | null;
}

/**
 * Every working form, for the Forms home grid.
 *
 * Templates are excluded: a template in the forms list reads as a form somebody forgot to finish,
 * and its response count would always be zero. Categories and counts are enrichment — the grid
 * still loads without them, and a count that could not be read is reported as unknown (and
 * logged), never as "0 responses" (#247). A failed read of the forms themselves THROWS.
 */
export async function readFormListing(rv: Reader = new RunView()): Promise<FormListing> {
  const [formsRes, catsRes] = (await rv.RunViews([
    {
      EntityName: FORMS_ENTITY.Form,
      ExtraFilter: 'IsTemplate = 0',
      ResultType: 'simple',
      Fields: ['ID', 'Name', 'Status', 'CategoryID', '__mj_UpdatedAt'],
      OrderBy: 'Name',
    },
    { EntityName: FORMS_ENTITY.FormCategory, ResultType: 'simple', Fields: ['ID', 'Name'] },
  ])) as [RunViewResult<FormListRecord>, RunViewResult<FormCategoryRecord>];

  if (!formsRes.Success) {
    // This message is the DETAIL of the home alert, which already leads with "Failed to load forms"
    // (see failureMessage) — so the fallback states a reason, not the headline again.
    throw new Error(formsRes.ErrorMessage || 'the Forms view reported a failure with no error message');
  }
  if (!catsRes.Success) {
    LogError(`Forms home: form categories could not be read, so none are named: ${catsRes.ErrorMessage}`);
  }
  const forms = formsRes.Results;
  return { forms, categories: catsRes.Success ? catsRes.Results : [], counts: await readCountsOrNull(rv, forms) };
}

async function readCountsOrNull(rv: Reader, forms: readonly FormListRecord[]): Promise<Map<string, number> | null> {
  try {
    return await loadCompleteResponseCounts(rv, forms.map((f) => f.ID));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    LogError(`Counting Complete responses for ${forms.length} forms on Forms home failed: ${reason}`);
    return null;
  }
}

/** One card in the gallery's "Your templates" section. */
export interface SavedTemplateRow {
  id: string;
  name: string;
  description: string | null;
  questionCount: number;
  pageCount: number;
  updatedAt: Date | null;
}

/**
 * Every saved template with the counts its card shows, newest first. Throws when the templates
 * themselves cannot be read; a count that cannot be read is logged and shown as 0.
 *
 * Two round-trips rather than one: the template ids have to exist before the counts can be asked
 * for. The alternative — a `FormID IN (SELECT ... WHERE IsTemplate = 1)` subquery — would hardcode
 * the Forms schema name into an ExtraFilter, and the schema name is configuration.
 */
export async function readSavedTemplates(rv: Reader = new RunView()): Promise<SavedTemplateRow[]> {
  const templates = await rv.RunView<{ ID: string; Name: string; Description: string | null; __mj_UpdatedAt: Date | string | null }>({
    EntityName: FORMS_ENTITY.Form,
    ExtraFilter: 'IsTemplate = 1',
    ResultType: 'simple',
    Fields: ['ID', 'Name', 'Description', '__mj_UpdatedAt'],
    OrderBy: '__mj_UpdatedAt DESC',
  });
  if (!templates.Success) {
    throw new Error(templates.ErrorMessage || 'Failed to load saved templates.');
  }
  if (templates.Results.length === 0) {
    return [];
  }
  const inList = templates.Results.map((t) => quoteSqlString(t.ID)).join(',');
  const [questionsRes, pagesRes] = (await rv.RunViews([
    { EntityName: FORMS_ENTITY.FormQuestion, ExtraFilter: `FormID IN (${inList})`, ResultType: 'simple', Fields: ['FormID'] },
    { EntityName: FORMS_ENTITY.FormPage, ExtraFilter: `FormID IN (${inList})`, ResultType: 'simple', Fields: ['FormID'] },
  ])) as [RunViewResult<{ FormID: string }>, RunViewResult<{ FormID: string }>];
  if (!questionsRes.Success) {
    LogError(`Template gallery: question counts unavailable — ${questionsRes.ErrorMessage}`);
  }
  if (!pagesRes.Success) {
    LogError(`Template gallery: page counts unavailable — ${pagesRes.ErrorMessage}`);
  }
  const questions = countByForm(questionsRes.Success ? questionsRes.Results : []);
  const pages = countByForm(pagesRes.Success ? pagesRes.Results : []);
  return templates.Results.map((t) => ({
    id: t.ID,
    name: t.Name,
    description: t.Description,
    questionCount: questions.get(t.ID) ?? 0,
    pageCount: pages.get(t.ID) ?? 0,
    updatedAt: toDate(t.__mj_UpdatedAt),
  }));
}

/**
 * The template saved from this form, if one still exists, or null (logged when the read failed).
 *
 * Read from `TemplateSourceFormID` rather than by matching names: the copy is independent and
 * either side can be renamed, so a name match would go wrong in both directions.
 */
export async function findTemplateSavedFrom(
  formId: string,
  rv: Pick<RunView, 'RunView'> = new RunView(),
): Promise<string | null> {
  const res = await rv.RunView<{ ID: string }>({
    EntityName: FORMS_ENTITY.Form,
    ExtraFilter: `IsTemplate = 1 AND TemplateSourceFormID='${escapeSqlString(formId)}'`,
    ResultType: 'simple',
    Fields: ['ID'],
    OrderBy: '__mj_UpdatedAt DESC',
    MaxRows: 1,
  });
  if (!res.Success) {
    LogError(`Could not check whether form ${formId} has a saved template: ${res.ErrorMessage}`);
    return null;
  }
  return res.Results[0]?.ID ?? null;
}

/**
 * One Form row as an entity, or null (logged) when it cannot be read.
 *
 * Read with a view rather than `Load()`: `Load()` also fills the form's generated `Pages` and
 * `Screens` collections, and the one caller (the builder's saved-template comparison) loads the
 * template's tree right after with `BuilderStateService.loadTree`, which reads both again — two
 * wasted reads per refresh.
 */
export async function loadFormRecord(
  formId: string,
  rv: Pick<RunView, 'RunView'> = new RunView(),
): Promise<mjBizAppsFormsFormEntity | null> {
  const read = await rv.RunView<mjBizAppsFormsFormEntity>({
    EntityName: FORMS_ENTITY.Form,
    ExtraFilter: `ID=${quoteSqlString(formId)}`,
    ResultType: 'entity_object',
    MaxRows: 1,
  });
  if (!read.Success) {
    LogError(`Form ${formId} could not be read: ${read.ErrorMessage || 'no reason given'}`);
    return null;
  }
  return read.Results[0] ?? null;
}

function countByForm(rows: readonly { FormID: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.FormID, (counts.get(row.FormID) ?? 0) + 1);
  }
  return counts;
}
