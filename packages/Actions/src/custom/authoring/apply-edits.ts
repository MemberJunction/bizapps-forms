/**
 * Persisting what {@link planEdits} already decided.
 *
 * ── THIS LAYER DECIDES NOTHING. ──────────────────────────────────────────────────────────────
 * Every judgement — which row a handle names, whether a delete would strand answers, whether a
 * type change is safe — happened in the pure plan, where it is testable without a database. What
 * is left here is writing, and reporting what was written in words the reply can use verbatim.
 *
 * The split matters because the two halves fail differently: a wrong decision is a product bug you
 * reason about, a failed write is an operational one you retry. Keeping them apart means the first
 * kind never needs a database to reproduce.
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { TransactionGroupBase } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { isFormQuestionType, type EditPlan, type ResolvedEdit } from '@mj-biz-apps/forms-entities';
import {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
import { errorText } from '../shared/error-text';
import { saveRow } from './persist';

const ENTITY = {
  question: 'MJ_BizApps_Forms: Form Questions',
  option: 'MJ_BizApps_Forms: Form Question Options',
  page: 'MJ_BizApps_Forms: Form Pages',
  screen: 'MJ_BizApps_Forms: Form Screens',
  form: 'MJ_BizApps_Forms: Forms',
  style: 'MJ_BizApps_Forms: Form Styles',
} as const;

/** What one turn's edits actually did, in sentences the reply can use. */
export interface EditOutcome {
  /** One line per operation that landed, naming the thing it changed. */
  applied: string[];
  /** One line per operation that did not, carrying the plan's own wording. */
  refused: string[];
  /**
   * The `FormStyle` row a `setLayout` in this turn wrote to, when one landed.
   *
   * `setLayout` merges into the same `CSSVariables` field a restyle replaces, on the same row —
   * so it is exactly as undoable. The caller reported only the FORM it changed, and the undo path
   * keys on the STYLE, so "make the questions smaller" was silently the one theme change with no
   * way back. Absent when the turn changed no layout, which is the common case.
   */
  styleId?: string;
}

/**
 * Apply a vetted plan.
 *
 * Operations run IN ORDER and independently: one failing write does not abandon the rest, because
 * a turn that adds three questions and fails on the second should still leave the first and third.
 * A failure becomes a refusal line, so the reply never claims something that did not happen.
 */
export async function applyEdits(
  formId: string,
  plan: EditPlan,
  contextUser: UserInfo,
): Promise<EditOutcome> {
  const outcome: EditOutcome = {
    applied: [],
    refused: plan.refused.map((r) => r.reason),
  };
  for (const edit of plan.resolved) {
    try {
      const line = await applyOne(formId, edit, contextUser);
      if (line) {
        outcome.applied.push(line);
        if (edit.op === 'setLayout') {
          // Read once, and only when a layout change actually landed — the id is the applier's to
          // report because it is the only layer that knows which row it wrote.
          outcome.styleId ??= await styleIdOf(formId, contextUser);
        }
      }
    } catch (error) {
      LogError(`[Forms edit] ${edit.op} on ${edit.id} failed: ${errorText(error)}`);
      outcome.refused.push(`${edit.op} did not go through — ${errorText(error)}`);
    }
  }
  return outcome;
}

/** One operation. Returns the sentence describing it, or undefined when it changed nothing. */
async function applyOne(
  formId: string,
  edit: ResolvedEdit,
  contextUser: UserInfo,
): Promise<string | undefined> {
  if (edit.op === 'updateQuestion') {
    const md = new Metadata();
    const question = await md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(
      ENTITY.question,
      contextUser,
    );
    if (!(await question.Load(edit.id))) {
      throw new Error(`question ${edit.id} could not be loaded`);
    }
    const was = question.Prompt;
    if (edit.prompt !== undefined) {
      question.Prompt = edit.prompt;
    }
    if (edit.helpText !== undefined) {
      question.HelpText = edit.helpText;
    }
    if (edit.isRequired !== undefined) {
      question.IsRequired = edit.isRequired;
    }
    if (edit.type !== undefined) {
      // Re-checked rather than trusted: the plan validated it, and this is the statement that
      // writes it. A type predicate here is both the guard and the narrowing, so a later edit
      // cannot separate them.
      question.QuestionType = assertQuestionType(edit.type);
    }
    await saveRow(question, 'FormQuestion (edit)', { formId });
    return edit.prompt !== undefined && edit.prompt !== was
      ? `reworded "${was}" to "${edit.prompt}"`
      : `updated "${question.Prompt}"`;
  }
  if (edit.op === 'addQuestion') {
    const md = new Metadata();
    const siblings = await questionsOnPage(edit.id, contextUser);
    const at = positionAfter(siblings, edit.afterId, 'end');
    await shiftFrom(siblings, at, contextUser, formId);

    const question = await md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(
      ENTITY.question,
      contextUser,
    );
    question.NewRecord();
    question.FormID = formId;
    question.PageID = edit.id;
    question.QuestionType = assertQuestionType(edit.type);
    question.Prompt = edit.prompt;
    question.DisplayOrder = at;
    question.IsRequired = edit.isRequired ?? false;
    if (edit.helpText !== undefined) {
      question.HelpText = edit.helpText;
    }
    await saveRow(question, 'FormQuestion (added)', { formId });

    for (const [index, label] of (edit.options ?? []).entries()) {
      const option = await md.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(
        ENTITY.option,
        contextUser,
      );
      option.NewRecord();
      option.QuestionID = question.ID;
      option.Label = label;
      option.DisplayOrder = index;
      await saveRow(option, 'FormQuestionOption (added)', { formId });
    }
    const choices = (edit.options ?? []).length;
    return `added "${edit.prompt}" (${edit.type}${choices ? `, ${choices} choices` : ''})`;
  }

  if (edit.op === 'updateOption') {
    const md = new Metadata();
    const option = await md.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(
      ENTITY.option,
      contextUser,
    );
    if (!(await option.Load(edit.id))) {
      throw new Error(`choice ${edit.id} could not be loaded`);
    }
    const before = option.Label;
    option.Label = edit.label;
    await saveRow(option, 'FormQuestionOption (edit)', { formId });
    return `relabelled "${before}" to "${edit.label}"`;
  }

  if (edit.op === 'deleteQuestion') {
    const md = new Metadata();
    const question = await md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(
      ENTITY.question,
      contextUser,
    );
    if (!(await question.Load(edit.id))) {
      throw new Error(`question ${edit.id} could not be loaded`);
    }
    const prompt = question.Prompt;
    const pageId = question.PageID;
    // Options first: `FormQuestionOption.QuestionID` is NOT NULL, so the parent delete fails on
    // the constraint while any child survives. Both go in ONE group — see `deleteInOneGo`. Options
    // carry no FK from `FormResponseAnswer`, so deleting them row-by-row succeeded even when the
    // question could not be deleted, leaving a choice question with no choices to choose from.
    await deleteInOneGo(
      [...(await optionsOf(edit.id, contextUser)), question],
      `"${prompt}"`,
      contextUser,
    );
    // A question with no page has no siblings to renumber; nothing to close up.
    if (pageId) {
      await renumber(await questionsOnPage(pageId, contextUser), contextUser, formId);
    }
    return `removed "${prompt}"`;
  }

  if (edit.op === 'moveQuestion') {
    const md = new Metadata();
    const question = await md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(
      ENTITY.question,
      contextUser,
    );
    if (!(await question.Load(edit.id))) {
      throw new Error(`question ${edit.id} could not be loaded`);
    }
    const fromPage = question.PageID;
    if (!fromPage) {
      throw new Error(`question ${edit.id} is not on a page, so it cannot be moved`);
    }
    const toPage = edit.toPageId ?? fromPage;
    // Computed against the page WITHOUT this question, so moving down does not count the row's
    // own current slot and land it one short of where it was asked to go.
    const siblings = (await questionsOnPage(toPage, contextUser)).filter((q) => q.ID !== edit.id);
    const at = positionAfter(siblings, edit.afterId, 'top');
    await shiftFrom(siblings, at, contextUser, formId);
    question.PageID = toPage;
    question.DisplayOrder = at;
    await saveRow(question, 'FormQuestion (moved)', { formId });
    if (toPage !== fromPage) {
      await renumber(await questionsOnPage(fromPage, contextUser), contextUser, formId);
    }
    return `moved "${question.Prompt}"`;
  }

  if (edit.op === 'addPage') {
    const md = new Metadata();
    const existing = await pagesOf(formId, contextUser);
    const page = await md.GetEntityObject<mjBizAppsFormsFormPageEntity>(ENTITY.page, contextUser);
    page.NewRecord();
    page.FormID = formId;
    page.Title = edit.title;
    page.DisplayOrder = existing.length;
    if (edit.description !== undefined) {
      page.Description = edit.description;
    }
    await saveRow(page, 'FormPage (added)', { formId });
    return `added a page called "${edit.title}"`;
  }

  if (edit.op === 'updatePage') {
    const md = new Metadata();
    const page = await md.GetEntityObject<mjBizAppsFormsFormPageEntity>(ENTITY.page, contextUser);
    if (!(await page.Load(edit.id))) {
      throw new Error(`page ${edit.id} could not be loaded`);
    }
    if (edit.title !== undefined) {
      page.Title = edit.title;
    }
    if (edit.description !== undefined) {
      page.Description = edit.description;
    }
    await saveRow(page, 'FormPage (edit)', { formId });
    return `renamed the page to "${page.Title}"`;
  }

  if (edit.op === 'deletePage') {
    const md = new Metadata();
    const page = await md.GetEntityObject<mjBizAppsFormsFormPageEntity>(ENTITY.page, contextUser);
    if (!(await page.Load(edit.id))) {
      throw new Error(`page ${edit.id} could not be loaded`);
    }
    const title = page.Title;
    // The plan already proved nothing on it has answers; the rows still have to go in FK order,
    // and they all go in ONE group — see `deleteInOneGo`. Row-by-row, a question that picked up
    // an answer after the snapshot was taken failed its delete while its siblings had already
    // been destroyed, and the author was told the edit had not gone through.
    const doomed: DeletableRow[] = [];
    for (const question of await questionsOnPage(edit.id, contextUser)) {
      doomed.push(...(await optionsOf(question.ID, contextUser)), question);
    }
    doomed.push(page);
    await deleteInOneGo(doomed, `"${title}"`, contextUser);
    await renumberPages(await pagesOf(formId, contextUser), contextUser, formId);
    return `removed the page "${title}"`;
  }

  if (edit.op === 'updateScreen') {
    const md = new Metadata();
    const screen = await md.GetEntityObject<mjBizAppsFormsFormScreenEntity>(ENTITY.screen, contextUser);
    if (!(await screen.Load(edit.id))) {
      throw new Error(`screen ${edit.id} could not be loaded`);
    }
    if (edit.title !== undefined) {
      screen.Title = edit.title;
    }
    if (edit.body !== undefined) {
      screen.Body = edit.body;
    }
    if (edit.buttonLabel !== undefined) {
      screen.ButtonLabel = edit.buttonLabel;
    }
    await saveRow(screen, 'FormScreen (edit)', { formId });
    const which = screen.ScreenType === 'Welcome' ? 'start' : 'finish';
    return `reworded the ${which} screen to "${screen.Title}"`;
  }

  if (edit.op === 'setLayout') {
    const md = new Metadata();
    const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>(ENTITY.form, contextUser);
    if (!(await form.Load(formId)) || !form.StyleID) {
      throw new Error('this form has no style to change');
    }
    const style = await md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(ENTITY.style, contextUser);
    if (!(await style.Load(form.StyleID))) {
      throw new Error(`style ${form.StyleID} could not be loaded`);
    }
    // MERGED, never replaced. A full write would take the palette with it, and the whole reason
    // this is a separate operation from a restyle is that the two must not disturb each other.
    const current = readTokens(style.CSSVariables);
    style.CSSVariables = JSON.stringify({ ...current, ...edit.tokens }, null, 2);
    await saveRow(style, 'FormStyle (layout)', { formId });
    const names = Object.keys(edit.tokens).join(', ');
    return `set ${names}`;
  }

  return undefined;
}

/** The shape `deleteInOneGo` needs: anything MJ can enlist in a transaction and delete. */
type DeletableRow = {
  TransactionGroup: TransactionGroupBase;
  Delete(): Promise<boolean>;
  LatestResult?: { CompleteMessage?: string } | null;
};

/**
 * Delete every row, in the order given, or delete none of them.
 *
 * WHY A GROUP. Row-by-row, each `Delete()` commits on its own, so a failure partway through left
 * the earlier rows permanently gone while the edit reported a refusal — the author was told
 * nothing happened, and had no way to find out what had actually gone missing. A delete has no
 * undo, so "some of it" is the one outcome that must not be reachable. Two live races produce it:
 * a question that picks up its first answer during the model round-trip (the plan's gate reads a
 * snapshot taken before the model was called, so it cannot see that), and an option row, which
 * carries no FK from `FormResponseAnswer` and therefore deletes happily even when the question it
 * belongs to cannot.
 *
 * `Delete()` on a row holding a `TransactionGroup` QUEUES the work and returns without writing;
 * `Submit()` executes the queue in the order it was built, which is why the caller's FK ordering
 * still matters inside the group.
 *
 * Throws on failure — `applyEdits` turns that into a refusal line, which is now honest, because
 * the rollback means nothing was written.
 */
async function deleteInOneGo(
  rows: readonly DeletableRow[],
  describe: string,
  contextUser: UserInfo,
): Promise<void> {
  const group = await new Metadata().CreateTransactionGroup();
  for (const row of rows) {
    row.TransactionGroup = group;
    // CHECK THE BOOLEAN EVEN THOUGH THIS ONLY QUEUES. `Delete()` still reaches
    // `ProviderToUse.Delete()` when a group is set — that call is what enrols the row — and it
    // returns false on a permission or provider refusal. A row that returns false was never
    // enrolled, so `Submit()` would go on to commit the REST of them and report success: the
    // partial delete this helper exists to prevent, rebuilt one layer up. Throwing here abandons
    // the group unsubmitted, so nothing is written.
    if (!(await row.Delete())) {
      const why = row.LatestResult?.CompleteMessage ?? 'the row could not be queued for deletion';
      LogError(`[Forms edits] ${describe} could not be removed for ${contextUser.ID}: ${why}`);
      throw new Error(`${describe} could not be removed (${why}). Nothing was removed.`);
    }
  }
  if (!(await group.Submit())) {
    const detail = rows[rows.length - 1]?.LatestResult?.CompleteMessage ?? 'the transaction was rolled back';
    LogError(`[Forms edits] ${describe} could not be removed for ${contextUser.ID}: ${detail}`);
    throw new Error(`${describe} could not be removed (${detail}). Nothing was removed.`);
  }
}

/** The style row a form points at, or undefined when it has none. */
async function styleIdOf(formId: string, contextUser: UserInfo): Promise<string | undefined> {
  const form = await new Metadata().GetEntityObject<mjBizAppsFormsFormEntity>(
    ENTITY.form,
    contextUser,
  );
  if (!(await form.Load(formId))) {
    LogError(`[Forms edits] Could not re-read form ${formId} to name the style it changed`);
    return undefined;
  }
  return form.StyleID ?? undefined;
}

/** A form's pages, in display order. */
async function pagesOf(
  formId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormPageEntity[]> {
  const view = await new RunView().RunView<mjBizAppsFormsFormPageEntity>(
    {
      EntityName: ENTITY.page,
      ExtraFilter: `FormID='${formId}'`,
      OrderBy: 'DisplayOrder',
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!view.Success) {
    throw new Error(`the form's pages could not be read: ${view.ErrorMessage}`);
  }
  return [...(view.Results ?? [])].sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

/** Close any gaps in page ordering. */
async function renumberPages(
  pages: readonly mjBizAppsFormsFormPageEntity[],
  contextUser: UserInfo,
  formId: string,
): Promise<void> {
  for (const [index, page] of pages.entries()) {
    if (page.DisplayOrder !== index) {
      page.DisplayOrder = index;
      await saveRow(page, 'FormPage (renumbered)', { formId });
    }
  }
}

/** A style's tokens, or an empty map when it has none or they will not parse. */
function readTokens(raw: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    // A style whose JSON will not parse should not block a layout change: the tokens being set are
    // written regardless, and the unreadable ones were already not rendering.
    LogError(`[Forms edit] style tokens for form did not parse; writing only the new ones.`);
    return {};
  }
}

/** The question type, narrowed. Throws rather than writing a type the widget cannot render. */
function assertQuestionType(value: string): mjBizAppsFormsFormQuestionEntity['QuestionType'] {
  if (!isFormQuestionType(value)) {
    throw new Error(`${value} is not a question type this form engine has`);
  }
  return value;
}

/** A page's questions, in display order. */
async function questionsOnPage(
  pageId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormQuestionEntity[]> {
  const view = await new RunView().RunView<mjBizAppsFormsFormQuestionEntity>(
    {
      EntityName: ENTITY.question,
      ExtraFilter: `PageID='${pageId}'`,
      OrderBy: 'DisplayOrder',
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!view.Success) {
    throw new Error(`the page's questions could not be read: ${view.ErrorMessage}`);
  }
  return [...(view.Results ?? [])].sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

/** A question's options. */
async function optionsOf(
  questionId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormQuestionOptionEntity[]> {
  const view = await new RunView().RunView<mjBizAppsFormsFormQuestionOptionEntity>(
    {
      EntityName: ENTITY.option,
      ExtraFilter: `QuestionID='${questionId}'`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!view.Success) {
    throw new Error(`the question's options could not be read: ${view.ErrorMessage}`);
  }
  return view.Results ?? [];
}

/**
 * The slot immediately after `afterId`, or `whenUnanchored` when nothing was named.
 *
 * The fallback is a PARAMETER because the two callers genuinely disagree about it: "add a rating
 * question" means at the end of the page, and "move the email question" with no position named
 * means to the top. Sharing one default silently gave `addQuestion` the move's answer and buried
 * every new question above the questions it was meant to follow.
 */
function positionAfter(
  siblings: readonly mjBizAppsFormsFormQuestionEntity[],
  afterId: string | undefined,
  whenUnanchored: 'top' | 'end',
): number {
  if (!afterId) {
    return whenUnanchored === 'top' ? 0 : siblings.length;
  }
  const index = siblings.findIndex((q) => q.ID === afterId);
  if (index === -1) {
    // Reachable, despite the plan's check. `planEdits` refuses a position naming a question on
    // another page, but it resolves the WHOLE batch against one snapshot — so a `deleteQuestion`
    // earlier in the same turn can remove the very row a later `addQuestion` names, and by the
    // time this runs the anchor is gone. An unusable position is then the same situation as no
    // position at all, and answering it with `siblings.length` rather than the caller's default
    // silently gave `moveQuestion` the append that `addQuestion` wanted.
    //
    // It is still SILENT, which is the part worth fixing next: the author asked for a slot and got
    // the end of the page with no line saying so.
    return whenUnanchored === 'top' ? 0 : siblings.length;
  }
  return index + 1;
}

/**
 * Push everything at or past `at` down one slot.
 *
 * Without this an insertion shares a `DisplayOrder` with the row it displaced, and two questions
 * on one number render in whatever order the database felt like — a reordering bug that looks
 * intermittent because it depends on the query plan.
 */
async function shiftFrom(
  siblings: readonly mjBizAppsFormsFormQuestionEntity[],
  at: number,
  contextUser: UserInfo,
  formId: string,
): Promise<void> {
  for (const [index, question] of siblings.entries()) {
    const wanted = index < at ? index : index + 1;
    if (question.DisplayOrder !== wanted) {
      question.DisplayOrder = wanted;
      await saveRow(question, 'FormQuestion (shifted)', { formId });
    }
  }
}

/** Close any gaps so the page reads 0, 1, 2 … again. */
async function renumber(
  siblings: readonly mjBizAppsFormsFormQuestionEntity[],
  contextUser: UserInfo,
  formId: string,
): Promise<void> {
  for (const [index, question] of siblings.entries()) {
    if (question.DisplayOrder !== index) {
      question.DisplayOrder = index;
      await saveRow(question, 'FormQuestion (renumbered)', { formId });
    }
  }
}
