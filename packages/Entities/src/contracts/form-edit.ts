/**
 * What the assistant may change about an existing form, and the pure decision layer that vets it.
 *
 * ── A DELTA, NOT A REPLACEMENT. ──────────────────────────────────────────────────────────────
 * The model proposes OPERATIONS against handles it was shown, never a revised form. A replacement
 * would mean minting new question rows, and `FormResponseAnswer.QuestionID` points at the old
 * ones — so every answer already collected would be orphaned by a reword. Operations keep the row.
 *
 * ── THE DECIDING IS PURE; THE WRITING IS NOT. ────────────────────────────────────────────────
 * Everything that can go wrong — resolving a handle, refusing a destructive change, rejecting a
 * type change that would strand answers — happens in {@link planEdits}, which touches nothing and
 * is fully testable. The applier that follows only persists what the plan already decided, so the
 * risky reasoning is never entangled with the I/O that makes it hard to exercise.
 */
import { z } from 'zod';
import { isFormQuestionType, questionTypeHasOptions, type FormQuestionType } from './question-types';
import { resolveHandle, type FormSnapshot, type SnapshotTarget,
  ANSWER_COUNT_UNKNOWN,
  describeAnswerCount,
  describeAnswerers,
  isAnswerCountKnown,
} from './form-snapshot';

/** Reword or re-flag an existing question. Every field but the handle is optional. */
export const updateQuestionSchema = z.object({
  op: z.literal('updateQuestion'),
  handle: z.string().min(1),
  prompt: z.string().min(1).optional(),
  helpText: z.string().optional(),
  isRequired: z.boolean().optional(),
  /** Gated on nobody having answered it — retyping does not migrate the stored answers. */
  type: z.string().min(1).optional(),
});

/** Move a question within its page, to another page, or both. */
export const moveQuestionSchema = z.object({
  op: z.literal('moveQuestion'),
  handle: z.string().min(1),
  /** The question it should follow. Absent means the top of the page. */
  after: z.string().min(1).optional(),
  /** The page it should end up on. Absent means the one it is already on. */
  toPage: z.string().min(1).optional(),
});

/**
 * Add a question to a page.
 *
 * `handle` names the PAGE, not a question — which is the mistake a model makes when it means
 * "next to q1", so the kind is checked rather than hoped for. `after` places it; absent means the
 * end of the page.
 */
export const addQuestionSchema = z.object({
  op: z.literal('addQuestion'),
  handle: z.string().min(1),
  type: z.string().min(1),
  prompt: z.string().min(1),
  helpText: z.string().optional(),
  isRequired: z.boolean().optional(),
  options: z.array(z.string().min(1)).optional(),
  after: z.string().min(1).optional(),
});

/** Remove a question and its options. Gated on nobody having answered it — see {@link planEdits}. */
export const deleteQuestionSchema = z.object({
  op: z.literal('deleteQuestion'),
  handle: z.string().min(1),
});

/** Add a page at the end of the form. */
export const addPageSchema = z.object({
  op: z.literal('addPage'),
  title: z.string().min(1),
  description: z.string().optional(),
});

/** Retitle or redescribe a page. */
export const updatePageSchema = z.object({
  op: z.literal('updatePage'),
  handle: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});

/** Remove a page and everything on it. Gated through its questions — see {@link planEdits}. */
export const deletePageSchema = z.object({
  op: z.literal('deletePage'),
  handle: z.string().min(1),
});

/** Reword a welcome or ending screen. */
export const updateScreenSchema = z.object({
  op: z.literal('updateScreen'),
  handle: z.string().min(1),
  /** The big line on the screen. `Title` on the row — same word, so nothing has to translate. */
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  /** The call to action, e.g. "Start" or "Send it". */
  buttonLabel: z.string().min(1).optional(),
});

/**
 * Set sizing, alignment or corner radius.
 *
 * Its own operation rather than part of a restyle, because these stay the house decision unless
 * the author asks for them BY NAME. Separating them is what lets the prompt say so and the plan
 * enforce it — a palette token arriving here is refused, since it would route around the contrast
 * gate every colour is supposed to pass.
 */
export const setLayoutSchema = z.object({
  op: z.literal('setLayout'),
  tokens: z.record(z.string()),
});

/**
 * Relabelling one choice.
 *
 * Separate from `updateQuestion` rather than an `options` array on it: rewriting the whole list
 * would have to delete and recreate the rows, and `FormResponseAnswer` stores the option's id.
 * Every stored answer naming that choice would stop resolving. Naming one row and changing its
 * text leaves the id — and therefore every answer already given — alone.
 */
export const updateOptionSchema = z.object({
  op: z.literal('updateOption'),
  handle: z.string().min(1),
  label: z.string().min(1),
});

/** The whole vocabulary. Grows one operation at a time, each with its own tests. */
export const editOperationSchema = z.discriminatedUnion('op', [
  updateOptionSchema,
  updateQuestionSchema,
  deleteQuestionSchema,
  addQuestionSchema,
  moveQuestionSchema,
  addPageSchema,
  updatePageSchema,
  deletePageSchema,
  updateScreenSchema,
  setLayoutSchema,
]);

/**
 * The operations that name no handle: they create something, or target the form as a whole.
 *
 * A TYPE, not just a runtime set, so the compiler enforces that {@link HANDLE_KIND} covers exactly
 * the operations that DO name one. Adding an operation and forgetting to say what its handle must
 * name is then a build error rather than an operation that silently resolves nothing.
 */
export type HandleFreeOperation =
  | z.infer<typeof addPageSchema>
  | z.infer<typeof setLayoutSchema>;

/** Every operation that names something on the form. */
export type HandleBoundOperation = Exclude<EditOperation, HandleFreeOperation>;

function isHandleFree(operation: EditOperation): operation is HandleFreeOperation {
  return operation.op === 'addPage' || operation.op === 'setLayout';
}

/** The five tokens `setLayout` may write. Mirrors `THEME_LAYOUT_TOKENS`, asserted in the spec. */
const SETTABLE_LAYOUT_TOKENS: readonly string[] = [
  '--mjf-title-size',
  '--mjf-title-align',
  '--mjf-question-size',
  '--mjf-question-align',
  '--mjf-btn-radius',
];

/**
 * What kind of thing each operation's `handle` must name.
 *
 * A table rather than a check inside each branch: the branches are where a missing check hides,
 * and every operation added from here on has to appear in this map or it will not resolve at all.
 */
const HANDLE_KIND: Record<HandleBoundOperation['op'], SnapshotTarget['kind']> = {
  updateQuestion: 'question',
  deleteQuestion: 'question',
  addQuestion: 'page',
  moveQuestion: 'question',
  updatePage: 'page',
  deletePage: 'page',
  updateScreen: 'screen',
  updateOption: 'option',
};



export type EditOperation = z.infer<typeof editOperationSchema>;

/**
 * An operation with its handle turned into the real row id.
 *
 * `droppedOptions` records that the plan discarded choices a plain question type could not show,
 * so the applier can say so. Without it the author is told the question was added and never learns
 * that part of what the model proposed went nowhere.
 */
export type ResolvedEdit = EditOperation & {
  id: string;
  afterId?: string;
  toPageId?: string;
  droppedOptions?: boolean;
};

/** An operation that will not be attempted, and why — in words the reply can use. */
export interface RefusedEdit {
  op: string;
  handle: string;
  reason: string;
}

/** What may be done, and what may not. */
export interface EditPlan {
  resolved: ResolvedEdit[];
  refused: RefusedEdit[];
}

/**
 * Vet a batch of operations against the form the model was actually shown.
 *
 * PARTIAL BY DESIGN. One bad handle in a batch of five refuses that one and keeps the other four:
 * a turn that adds three questions and mistypes one reference should still add the two it got
 * right, and all-or-nothing would make the assistant less useful the harder it tried.
 */
export function planEdits(
  snapshot: FormSnapshot,
  operations: readonly EditOperation[],
): EditPlan {
  const plan: EditPlan = { resolved: [], refused: [] };
  // Row ids this batch has already agreed to destroy. The whole batch is resolved against ONE
  // snapshot, so without this a later operation can name a position that will not exist by the
  // time it runs — and the applier cannot tell that apart from "no position given", so it appends
  // silently and reports success.
  const doomed = new Set<string>();
  // Where this batch has already moved a question TO. Two later checks need it, both because they
  // reason about a snapshot taken before the batch ran: a `deletePage` must not claim to be taking
  // a question that has left, and a position must be judged against where the anchor IS by then,
  // not where the snapshot last saw it.
  const movedTo = new Map<string, string>();
  for (const operation of operations) {
    if (isHandleFree(operation)) {
      const refusal = vetHandleFree(operation);
      if (refusal) {
        plan.refused.push(refusal);
      } else {
        plan.resolved.push({ ...operation, id: snapshot.formId });
      }
      continue;
    }
    const wanted = HANDLE_KIND[operation.op];
    const target = resolveHandle(snapshot, operation.handle);
    if (!target) {
      plan.refused.push({
        op: operation.op,
        handle: operation.handle,
        reason: `there is nothing called ${operation.handle} on this form`,
      });
      continue;
    }
    if (target.kind !== wanted) {
      plan.refused.push({
        op: operation.op,
        handle: operation.handle,
        reason: `${operation.handle} is ${article(target.kind)} ${target.kind}, and ${operation.op} needs ${article(wanted)} ${wanted}`,
      });
      continue;
    }
    if (operation.op === 'deletePage' && target.kind === 'page') {
      // Deleting a page takes its questions with it, so the per-question gate has to reach through
      // the page — otherwise it is bypassed by deleting the container instead of the contents.
      const answered = target.questions.filter((q) => q.answerCount > 0);
      if (answered.length > 0) {
        // A sentinel in the sum poisons the whole total, so an unknown anywhere makes the total
        // unknown — which is the honest answer, and the one `describeAnswerCount` renders.
        const total = answered.some((q) => !isAnswerCountKnown(q.answerCount))
          ? ANSWER_COUNT_UNKNOWN
          : answered.reduce((n, q) => n + q.answerCount, 0);
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason:
            `"${target.title ?? operation.handle}" holds ${answered.length} answered ` +
            `${answered.length === 1 ? 'question' : 'questions'} with ${describeAnswerCount(total)} between ` +
            'them, and deleting the page deletes those answers — move them off it first',
        });
        continue;
      }
    }
    if (operation.op === 'updateQuestion' && target.kind === 'question' && operation.type !== undefined) {
      if (!isFormQuestionType(operation.type)) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason: `${operation.type} is not a question type this form engine has`,
        });
        continue;
      }
      // A ShortText's answers live in `TextValue` and a Rating's in `NumericValue`. Retyping moves
      // nothing, so the answers already collected stop being readable by the question that owns
      // them — silently, with no undo. Rewording an answered question is fine; changing what its
      // answers MEAN is not.
      if (target.answerCount > 0) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason:
            `"${target.prompt}" already holds ${describeAnswerCount(target.answerCount)}, and changing its ` +
            'type would leave them stored in a shape the new type cannot read',
        });
        continue;
      }
      // THE SAME DECISION `addQuestion` MAKES, and it was only made there. `updateQuestionSchema`
      // carries no `options` field, so a retype cannot supply choices even in principle — "make
      // the name field a dropdown" produced an empty select nobody could answer, and nobody could
      // submit past if it was required. Retyping BETWEEN choice types is fine: the existing
      // choices carry over untouched.
      if (TYPES_THE_CHAT_CANNOT_BUILD.has(operation.type)) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason: `changing "${target.prompt}" into a ${operation.type} needs its choices split across rows and columns, which I cannot describe here — and a question's type cannot be changed in the builder either, so remove this one and pick ${operation.type} from the question palette down the left`,
        });
        continue;
      }
      // AND THE SAME TYPE AS A SOURCE. A Matrix's options are rows AND columns, and the snapshot
      // does not carry `MatrixAxis` — so they arrive here as one flat list, and retyping to a
      // Dropdown turns "Venue, Catering, Poor, Great" into four peers on one menu. The gate
      // guarded the destination and missed the origin, which is the same misreading of what
      // `options` means for this type.
      if (isFormQuestionType(target.type) && TYPES_THE_CHAT_CANNOT_BUILD.has(target.type)) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason: `"${target.prompt}" is a ${target.type}, and its rows and columns do not become a plain list of choices — remove it and pick ${operation.type} from the question palette down the left`,
        });
        continue;
      }
      if (questionTypeHasOptions(operation.type) && target.options.length === 0) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason:
            `"${target.prompt}" has no choices, and changing its type cannot add any — add a new ` +
            `${operation.type} question with its choices instead, and remove this one`,
        });
        continue;
      }
    }
    if (operation.op === 'moveQuestion') {
      if (operation.after === operation.handle) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason: `${operation.handle} cannot be moved after itself`,
        });
        continue;
      }
      // The page is resolved FIRST because it is what the position is checked against: a move
      // with no `toPage` stays where it is, so the destination is the question's current page.
      const page = resolvePage(snapshot, operation.toPage);
      if ('reason' in page) {
        plan.refused.push({ op: operation.op, handle: operation.handle, reason: page.reason });
        continue;
      }
      const placement = resolvePlacement(
        snapshot,
        operation,
        page.toPageId ?? movedTo.get(target.id) ?? pageIdOfQuestion(snapshot, target.id),
        doomed,
        movedTo,
      );
      if ('reason' in placement) {
        plan.refused.push({ op: operation.op, handle: operation.handle, reason: placement.reason });
        continue;
      }
      if (page.toPageId) {
        movedTo.set(target.id, page.toPageId);
      }
      plan.resolved.push({ ...operation, id: target.id, ...placement, ...page });
      continue;
    }
    if (operation.op === 'addQuestion') {
      // The type vocabulary is closed and shared with the widget. An invented type persists fine
      // and then renders as nothing, which is the worst of both.
      if (!isFormQuestionType(operation.type)) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason: `${operation.type} is not a question type this form engine has`,
        });
        continue;
      }
      // TYPE AND OPTIONS ARE ONE DECISION, not two independent fields. Nothing coupled them, so a
      // choice type could arrive with no choices: it resolved, persisted, and the reply announced
      // it, while the respondent got an empty select — and could not submit the form at all if it
      // was required.
      //
      // THIS IS THE ONLY PLACE THAT REFUSES IT. An earlier version of this comment said "the rest
      // of the pipeline already refuses both", which is not true of any layer: the blueprint
      // schema has no `.min(1)` and no type/option coupling, `createOptions` silently returns zero
      // for a choice type with no options, and `offeredValues` returns null for an empty list and
      // declines to check at submit time. Nothing downstream will catch what passes here.
      if (TYPES_THE_CHAT_CANNOT_BUILD.has(operation.type)) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason: `a ${operation.type} question needs its choices split across rows and columns, which I cannot describe here — pick ${operation.type} from the question palette down the left of the builder, and I can reword it afterwards`,
        });
        continue;
      }
      const wantsOptions = questionTypeHasOptions(operation.type);
      const given = operation.options?.length ?? 0;
      if (wantsOptions && given === 0) {
        plan.refused.push({
          op: operation.op,
          handle: operation.handle,
          reason: `a ${operation.type} question needs its choices — send them in "options", or ask for a question type that does not have any`,
        });
        continue;
      }
      // The MIRROR case is not symmetrical, deliberately. A choice type with no choices cannot be
      // built at all, so it is refused. A plain type carrying stray options is a question the
      // author genuinely asked for, plus rows that would never render — refusing it would cost
      // them the question over a quirk of the model's output they never saw. The options are
      // dropped instead, which is "change what they asked for and not more" rather than "do
      // nothing because part of the request was odd". The plan records that it happened so the
      // reply can say so — silently discarding part of a request is what makes the trade dishonest,
      // and an earlier version of this comment claimed the applier reported it when nothing did.
      const placement = resolvePlacement(snapshot, operation, target.id, doomed, movedTo);
      if ('reason' in placement) {
        plan.refused.push({ op: operation.op, handle: operation.handle, reason: placement.reason });
        continue;
      }
      const droppedOptions = !wantsOptions && given > 0;
      const options = wantsOptions ? operation.options : undefined;
      plan.resolved.push({ ...operation, options, droppedOptions, id: target.id, ...placement });
      continue;
    }
    // THE DELETION GATE. `FormResponseAnswer.QuestionID` points at this row, so removing it
    // removes the answers with it, and the builder has no undo. Per QUESTION, not per form: a
    // live form can gain a question nobody has reached yet, and that one is free to remove.
    if (operation.op === 'deleteQuestion' && target.kind === 'question' && target.answerCount > 0) {
      plan.refused.push({
        op: operation.op,
        handle: operation.handle,
        reason:
          `${describeAnswerers(target.answerCount)} ` +
          `answered "${target.prompt}", and deleting it deletes their answers — it can be hidden ` +
          'instead, which keeps both',
      });
      continue;
    }
    if (operation.op === 'deleteQuestion') {
      doomed.add(target.id);
    }
    if (operation.op === 'deletePage' && target.kind === 'page') {
      // A page takes its questions with it, so each of them stops being a usable position too —
      // EXCEPT the ones this same turn has already moved off it. `deletePage` re-reads the page's
      // questions when it runs, so a question carried elsewhere by an earlier `moveQuestion`
      // survives, and dooming it refused a legitimate position ("merge page 1 into page 2, then
      // drop page 1") with a reason that was simply untrue.
      for (const question of target.questions) {
        // "Moved" only counts when it moved OFF THIS PAGE. `toPage` naming the page a question is
        // already on is a supported no-op move, and treating that as an escape exempted a question
        // from the delete that does take it.
        if (movedTo.get(question.id) === target.id || !movedTo.has(question.id)) {
          doomed.add(question.id);
        }
      }
    }
    plan.resolved.push({ ...operation, id: target.id });
  }
  return plan;
}

/** Vet an operation that names no handle, returning a refusal or undefined. */
function vetHandleFree(operation: HandleFreeOperation): RefusedEdit | undefined {
  if (operation.op !== 'setLayout') {
    return undefined;
  }
  const stray = Object.keys(operation.tokens).filter((t) => !SETTABLE_LAYOUT_TOKENS.includes(t));
  if (stray.length > 0) {
    return {
      op: operation.op,
      handle: '',
      reason: `${stray.join(', ')} ${stray.length === 1 ? 'is a colour' : 'are colours'}, not layout — ask for a restyle instead`,
    };
  }
  return undefined;
}

/** The page a move targets, or the reason that reference does not work. */
function resolvePage(
  snapshot: FormSnapshot,
  handle: string | undefined,
): { toPageId?: string } | { reason: string } {
  if (!handle) {
    return {};
  }
  const page = resolveHandle(snapshot, handle);
  if (!page) {
    return { reason: `there is nothing called ${handle} to move it to` };
  }
  if (page.kind !== 'page') {
    return { reason: `${handle} is ${article(page.kind)} ${page.kind}, and a question moves onto a page` };
  }
  return { toPageId: page.id };
}

/**
 * The row a new question goes after, or the reason that reference does not work.
 *
 * `destinationPageId` is what makes this a real check rather than a spelling check. A position
 * only means anything among siblings, so an anchor on some OTHER page is not a position at all —
 * and the applier cannot tell that case apart from "no position given", because both reach it as
 * an id it fails to find among the destination's questions. It appended silently, which put the
 * question somewhere the author had not asked for and produced no line saying so. Refusing here
 * is the only place the two cases are still distinguishable.
 */
function resolvePlacement(
  snapshot: FormSnapshot,
  operation: { after?: string },
  destinationPageId: string | undefined,
  doomed: ReadonlySet<string>,
  movedTo: ReadonlyMap<string, string>,
): { afterId?: string } | { reason: string } {
  if (!operation.after) {
    return {};
  }
  const anchor = resolveHandle(snapshot, operation.after);
  if (!anchor) {
    return { reason: `there is nothing called ${operation.after} to put it after` };
  }
  if (doomed.has(anchor.id)) {
    return {
      reason: `${operation.after} is being removed by this same turn, so it cannot be a position — say where it should go instead, or ask for the position in a separate message`,
    };
  }
  if (anchor.kind !== 'question') {
    return { reason: `${operation.after} is ${article(anchor.kind)} ${anchor.kind}, so it cannot be a position` };
  }
  // Where the anchor lives by the time this operation runs — which is where an earlier move in
  // this same batch put it, if one did, and only otherwise what the snapshot shows.
  const anchorPageId = movedTo.get(anchor.id) ?? pageIdOfQuestion(snapshot, anchor.id);
  if (destinationPageId && anchorPageId !== destinationPageId) {
    return {
      reason: `${operation.after} is not on that page, so it cannot be a position there — name a question on the destination page, or leave the position out`,
    };
  }
  return { afterId: anchor.id };
}

/**
 * Types the chat's flat `options: string[]` genuinely cannot build.
 *
 * `questionTypeHasOptions` answers "does this type show choices", which is NOT the same question
 * and was used as though it were. A `Matrix` shows choices on TWO axes, and this vocabulary has no
 * way to say which axis a choice belongs to — so every one lands as a Row, the grid gets no
 * Columns, and the widget renders a table with nothing to click. `form-blueprint.ts` documents
 * that failure at the field the blueprint route added to avoid it (`matrixAxis`); the edit
 * vocabulary has no equivalent, so the honest answer is to decline and name the builder.
 */
const TYPES_THE_CHAT_CANNOT_BUILD: ReadonlySet<FormQuestionType> = new Set<FormQuestionType>(['Matrix']);

/** `an` before a vowel, `a` otherwise — `option` is the only vowel-initial handle kind. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/** The page holding a question, by row id. Undefined only if the id is not in the snapshot. */
function pageIdOfQuestion(snapshot: FormSnapshot, questionId: string): string | undefined {
  return snapshot.pages.find((page) => page.questions.some((q) => q.id === questionId))?.id;
}
