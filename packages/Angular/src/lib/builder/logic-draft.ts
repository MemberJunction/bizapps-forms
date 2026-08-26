/**
 * The working copy behind the "Edit logic" dialog — an item's whole rule, edited as one thing.
 *
 * An item's logic is two things at once: an optional "show this when…" gate, and an ORDERED list
 * of "if … then go to …" rules. They used to be authored one verb at a time behind a card
 * picker, which made the commonest question — "what does this question do?" — unanswerable
 * without opening two dialogs.
 *
 * ORDER IS THE SEMANTICS. `resolveFlow` takes the first jump whose conditions pass, so rule 1
 * beating rule 2 is not a display detail; it is what the author is deciding. Hence
 * {@link moveJumpRule} and the numbering in the dialog.
 *
 * Nothing here mutates its input. The dialog holds a draft, the item is written only on Save,
 * and "dirty" is value equality rather than touched-ness — so editing a value and putting it
 * back closes silently.
 */
import {
  MAX_JUMP_RULES,
  type ConditionalGroup,
  type ConditionalJumpRule,
  type ConditionalRule,
  type JumpTarget,
} from '@mj-biz-apps/forms-entities';

/**
 * One row in the dialog. Its target is optional ONLY here: a row exists from the moment the
 * author adds it, before they have said where it goes, and a half-authored row must never reach
 * the item — see {@link ruleFromLogicDraft}.
 */
export interface JumpDraft {
  when: ConditionalGroup;
  target?: JumpTarget;
}

/** Everything the dialog edits, for one item. */
export interface LogicDraft {
  /** The show gate; absent means the item always shows. */
  show: ConditionalGroup | undefined;
  jumps: JumpDraft[];
}

/** The jump rules an item carries, in order. */
export function jumpRules(rule: ConditionalRule | undefined): ConditionalJumpRule[] {
  return [...(rule?.jump ?? [])];
}

export function emptyLogicDraft(): LogicDraft {
  return { show: undefined, jumps: [] };
}

/** A draft of what this item currently holds. */
export function logicDraftOf(rule: ConditionalRule | undefined): LogicDraft {
  return {
    show: rule?.show,
    jumps: jumpRules(rule).map((j) => ({ when: j.when, target: j.target })),
  };
}

/**
 * The rule this draft would write, or `undefined` when it says nothing.
 *
 * Two kinds of row are dropped rather than stored, and both would otherwise be dangerous:
 *
 *  - a row with no TARGET is a rule that goes nowhere;
 *  - a row with no CONDITIONS fires for everyone, because `evaluateGroup({})` is vacuously true.
 *    A half-finished row silently becoming "always" is the worst thing an unfinished edit can do.
 *
 * An empty result collapses to `undefined` rather than `{}` — an empty rule object serializes as
 * a phantom "has a rule" marker every consumer then has to see through.
 */
export function ruleFromLogicDraft(draft: LogicDraft): ConditionalRule | undefined {
  const jump = draft.jumps.filter(isCommittableJump).map((j) => ({ when: j.when, target: j.target }));
  const rule: ConditionalRule = {};
  if (draft.show !== undefined) {
    rule.show = draft.show;
  }
  if (jump.length > 0) {
    rule.jump = jump;
  }
  return Object.keys(rule).length > 0 ? rule : undefined;
}

/** Whether this row is finished enough to store — see {@link ruleFromLogicDraft}. */
export function isCommittableJump(draft: JumpDraft): draft is JumpDraft & { target: JumpTarget } {
  return draft.target !== undefined && groupHasConditions(draft.when);
}

/** Whether a group carries any leaf condition. `{}`, `{all:[]}` and `{any:[]}` all do not. */
function groupHasConditions(group: ConditionalGroup | undefined): boolean {
  return (group?.all?.length ?? 0) > 0 || (group?.any?.length ?? 0) > 0;
}

/** Whether another rule may be added — the contract's cap, enforced where an author can see it. */
export function canAddJumpRule(draft: LogicDraft): boolean {
  return draft.jumps.length < MAX_JUMP_RULES;
}

export function addJumpRule(draft: LogicDraft): LogicDraft {
  if (!canAddJumpRule(draft)) {
    return draft;
  }
  return { ...draft, jumps: [...draft.jumps, { when: {} }] };
}

export function updateJumpRule(draft: LogicDraft, index: number, patch: Partial<JumpDraft>): LogicDraft {
  return { ...draft, jumps: draft.jumps.map((j, i) => (i === index ? { ...j, ...patch } : j)) };
}

export function removeJumpRule(draft: LogicDraft, index: number): LogicDraft {
  return { ...draft, jumps: draft.jumps.filter((_, i) => i !== index) };
}

/**
 * Move one rule up (`-1`) or down (`+1`), or return the draft untouched at either end.
 *
 * Untouched rather than clamped: a button that silently does nothing at the boundary is better
 * than one that reorders something else, and the dialog disables it there anyway.
 */
export function moveJumpRule(draft: LogicDraft, index: number, delta: -1 | 1): LogicDraft {
  const to = index + delta;
  if (to < 0 || to >= draft.jumps.length) {
    return draft;
  }
  const jumps = [...draft.jumps];
  [jumps[index], jumps[to]] = [jumps[to], jumps[index]];
  return { ...draft, jumps };
}

/**
 * Whether this draft differs from what the item had — the reason to warn on close.
 *
 * Compared through {@link ruleFromLogicDraft} rather than field by field, so the question asked
 * is the one that matters: would saving change anything? Adding an empty row and removing it
 * again is not a change, and neither is typing a value and typing it back.
 */
export function isLogicDraftDirty(draft: LogicDraft, baseline: LogicDraft): boolean {
  return !sameRule(ruleFromLogicDraft(draft), ruleFromLogicDraft(baseline));
}

/**
 * Structural equality for two rules.
 *
 * Deliberately not `JSON.stringify`: key order is an artifact of how an object was built, and
 * two rules that differ only in it are the same rule. A stringify comparison reported every
 * reopened dialog as dirty.
 */
function sameRule(a: ConditionalRule | undefined, b: ConditionalRule | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return sameGroupValue(a.show, b.show) && sameJumps(a.jump ?? [], b.jump ?? []);
}

function sameJumps(a: readonly ConditionalJumpRule[], b: readonly ConditionalJumpRule[]): boolean {
  return (
    a.length === b.length &&
    a.every((jump, i) => sameGroupValue(jump.when, b[i].when) && sameTarget(jump.target, b[i].target))
  );
}

function sameTarget(a: JumpTarget, b: JumpTarget): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  return a.kind === 'submit' || b.kind === 'submit' ? true : a.id === b.id;
}

function sameGroupValue(a: ConditionalGroup | undefined, b: ConditionalGroup | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return sameArm(a.all, b.all) && sameArm(a.any, b.any);
}

function sameArm(
  a: ConditionalGroup['all'] | undefined,
  b: ConditionalGroup['all'] | undefined,
): boolean {
  if (a === undefined || b === undefined) {
    return (a?.length ?? 0) === (b?.length ?? 0);
  }
  return (
    a.length === b.length &&
    a.every((c, i) => {
      const other = b[i];
      return (
        (c.source ?? 'question') === (other.source ?? 'question') &&
        c.questionId === other.questionId &&
        c.op === other.op &&
        String(c.value ?? '') === String(other.value ?? '')
      );
    })
  );
}
