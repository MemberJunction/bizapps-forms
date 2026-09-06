/**
 * Rewriting the question ids embedded in a form's JSON columns when the form is copied.
 *
 * THE TRAP THIS EXISTS FOR. Copying a form row-by-row gets you a form that looks right and is
 * quietly broken, because several columns store *references* to question ids rather than
 * structure:
 *
 *   - `FormPage.ConditionalRule`, `FormQuestion.ConditionalRule`, `FormScreen.ConditionalRule`
 *     and `FormAutomation.ConditionalRule` — `{ show: { all | any: [{ questionId, op, value }] },
 *     jump: [{ when, target }] }` (question ids in the groups, page/question ids in targets)
 *   - `FormEntityBinding.FieldMappings` — `{ version, fields: [{ source: { questionId } }] }`
 *
 * Copy those verbatim and the new form's branching points at the OLD form's questions. Nothing
 * errors. The evaluator simply never finds an answer for the id it was given, so the operand is
 * `undefined` — `false` for the equality family and TRUE for `isNotAnswered` / `notEquals`. The
 * questions behind those conditions are therefore pinned SHUT for every respondent, or pinned
 * OPEN for every respondent, depending on the operator: silently either way, with the copy still
 * looking correct in the builder, and discovered — if ever — as missing answers weeks later.
 * (Not the `NOT_EVALUABLE` sentinel, which is reserved for a condition naming nothing at all; a
 * copied id is still a perfectly good string. `rules-inventory.ts` carries the same correction.)
 *
 * WHAT AN UNMAPPABLE REFERENCE DOES. It is dropped, and counted. Keeping it would reproduce
 * exactly the hidden-forever failure above; dropping it leaves the question always visible,
 * which is wrong in the loud, obvious, fixable direction. The count comes back to the caller so
 * the copy can say what it did rather than quietly differing from its source.
 *
 * Pure and Angular-free on purpose: this is the half of the clone that can actually be tested.
 */
import type {
  ConditionalCondition,
  ConditionalGroup,
  ConditionalJumpRule,
  ConditionalRule,
  FieldMapping,
  FieldMappings,
  JumpTarget,
} from '@mj-biz-apps/forms-entities';

export interface RemapResult {
  json: string | null;
  /** How many question references were discarded because they had no counterpart. */
  dropped: number;
  /** Set when the stored JSON could not be used at all; the payload is dropped, never kept. */
  error?: string;
}

/** Whether a group carries any leaf condition — "was empty" is not "became empty". */
function hasConditions(group: ConditionalGroup | undefined): boolean {
  return (group?.all?.length ?? 0) > 0 || (group?.any?.length ?? 0) > 0;
}

export function remapConditionalRule(
  raw: string | null,
  idMap: ReadonlyMap<string, string>,
  /** Page-id counterparts, for page jump targets — those are dropped (and counted) without it. */
  pageIdMap?: ReadonlyMap<string, string>,
): RemapResult {
  if (raw === null || raw.trim() === '') {
    return { json: null, dropped: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      json: null,
      dropped: 1,
      error: `A conditional rule could not be parsed and was dropped: ${asText(err)}`,
    };
  }
  if (!isRuleShaped(parsed)) {
    return {
      json: null,
      dropped: 1,
      error: 'A conditional rule was not in the expected { show: { all | any } } shape and was dropped.',
    };
  }
  let dropped = 0;
  const remapArm = (arm: ConditionalCondition[] | undefined): ConditionalCondition[] | undefined => {
    if (arm === undefined) {
      return undefined;
    }
    const kept: ConditionalCondition[] = [];
    for (const condition of arm) {
      // A score condition references no question — the running total is form-relative and
      // copies verbatim.
      if (condition.source === 'score') {
        kept.push({ ...condition });
        continue;
      }
      const mapped = condition.questionId === undefined ? undefined : idMap.get(condition.questionId);
      if (mapped === undefined) {
        dropped++;
        continue;
      }
      kept.push({ ...condition, questionId: mapped });
    }
    return kept;
  };

  // An arm that lost every condition is REMOVED, not left as `[]`. The evaluator treats both
  // identically (an empty `all` is vacuously true, and so is an empty `any`), so this is about
  // what a human reads back: `"any": []` looks like a rule someone forgot to finish.
  const remapGroup = (
    group: { all?: ConditionalCondition[]; any?: ConditionalCondition[] } | undefined,
  ): ConditionalGroup | undefined => {
    if (group === undefined) {
      return undefined;
    }
    const all = remapArm(group.all);
    const any = remapArm(group.any);
    const out: ConditionalGroup = {};
    if (all !== undefined && all.length > 0) {
      out.all = all;
    }
    if (any !== undefined && any.length > 0) {
      out.any = any;
    }
    return out.all !== undefined || out.any !== undefined ? out : undefined;
  };

  // An empty `show` group collapses to no rule at all: `evaluateGroup({})` is vacuously true, so
  // `show: {}` means "always visible", which is exactly what having no rule means. Collapsing it
  // loses nothing. That is NOT true of the unconditional jump below — see the comment there for
  // the asymmetry, which is real and deliberate.
  //
  // A legacy `require` key is not read at all. The verb is gone, so carrying it into the copy
  // would plant a key nothing evaluates in a brand-new form — worse than dropping it, because a
  // future reader would take it for a live rule.
  const show = remapGroup(parsed.show);
  const jump: ConditionalJumpRule[] = [];
  for (const rule of parsed.jump ?? []) {
    const target = remapTarget(rule.target, idMap, pageIdMap);
    // `remapGroup` returns `undefined` for two different things, and only one of them is a
    // failure: a group whose every condition failed to remap, and a group that had no conditions
    // to begin with. The second is an UNCONDITIONAL jump — `evaluateGroup({})` is vacuously true,
    // so it always fires — which the editor cannot author but mj-sync metadata and the AI builder
    // can, and the zod schema accepts. Reading it as failure dropped the rule silently, so the
    // copy asked a page the original skipped and blamed "a reference to a question that was not
    // copied", which named nothing that had happened.
    const when = hasConditions(rule.when) ? remapGroup(rule.when) : rule.when;
    // A jump missing either half in the copy would point at the OLD form's page or question —
    // the exact hidden-forever failure this module exists to prevent. Dropped and counted, like
    // a dangling question reference.
    if (when === undefined || target === undefined) {
      dropped++;
      continue;
    }
    jump.push({ when, target });
  }

  const result: ConditionalRule = {};
  if (show !== undefined) {
    result.show = show;
  }
  if (jump.length > 0) {
    result.jump = jump;
  }
  if (Object.keys(result).length === 0) {
    return { json: null, dropped };
  }
  return { json: JSON.stringify(result), dropped };
}

/**
 * Rewrite a jump target for the copy, or `undefined` when it cannot be rewritten.
 *
 * `submit` references nothing, so it copies verbatim. Question and page targets go through the
 * id maps the clone already builds. An ENDING target is dropped and counted: this module is not
 * handed a screen-id map, and carrying the source form's screen id into the copy would point a
 * live branch at another form's ending — the same class of silent breakage the header describes.
 * Dropping is the loud, fixable direction, and the count reaches the author.
 */
function remapTarget(
  target: JumpTarget,
  idMap: ReadonlyMap<string, string>,
  pageIdMap: ReadonlyMap<string, string> | undefined,
): JumpTarget | undefined {
  switch (target.kind) {
    case 'submit':
      return target;
    case 'question': {
      const id = idMap.get(target.id);
      return id === undefined ? undefined : { kind: 'question', id };
    }
    case 'page': {
      const id = pageIdMap?.get(target.id);
      return id === undefined ? undefined : { kind: 'page', id };
    }
    case 'ending':
      return undefined;
  }
}

type GroupShape = { all?: ConditionalCondition[]; any?: ConditionalCondition[] };
type RuleShape = {
  show?: GroupShape;
  jump?: Array<{ when: GroupShape; target: JumpTarget }>;
};

/**
 * A stored rule is usable only if it is a plain object whose group arms are arrays (and whose
 * jump list, if any, is an array of `{ when, target }`). Anything else (an array, a string,
 * a number, `{show: 5}`) is data we cannot rewrite, and copying it verbatim would carry the
 * source form's question ids into the copy.
 */
function isRuleShaped(value: unknown): value is RuleShape {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const rule = value as RuleShape;
  if (!isGroupShaped(rule.show)) {
    return false;
  }
  if (rule.jump === undefined) {
    return true;
  }
  if (!Array.isArray(rule.jump)) {
    return false;
  }
  return rule.jump.every(
    (j) => typeof j === 'object' && j !== null && isTargetShaped(j.target) && isGroupShaped(j.when) && j.when !== undefined,
  );
}

/**
 * A jump target is usable only if it is tagged with a kind this build knows, and carries an id
 * when its kind needs one. The clone reads STORED json, which may predate a kind or postdate it.
 */
function isTargetShaped(target: unknown): target is JumpTarget {
  if (typeof target !== 'object' || target === null) {
    return false;
  }
  const kind = (target as { kind?: unknown }).kind;
  if (kind === 'submit') {
    return true;
  }
  if (kind !== 'question' && kind !== 'page' && kind !== 'ending') {
    return false;
  }
  return typeof (target as { id?: unknown }).id === 'string';
}

function isGroupShaped(group: GroupShape | undefined): boolean {
  if (group === undefined) {
    return true;
  }
  if (typeof group !== 'object' || group === null || Array.isArray(group)) {
    return false;
  }
  const armsAreArrays = (arm: unknown): boolean => arm === undefined || Array.isArray(arm);
  return armsAreArrays(group.all) && armsAreArrays(group.any);
}

function asText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Rewrite the question ids inside an entity binding's `FieldMappings`.
 *
 * Same contract as {@link remapConditionalRule}, and the stakes are higher: a binding writes
 * answers into a REAL entity record, so a mapping still pointing at the source form's question
 * would read as unanswered on every submission and write a blank over whatever was there.
 * Static sources carry no id and pass through untouched.
 */
export function remapFieldMappings(
  raw: string | null,
  idMap: ReadonlyMap<string, string>,
): RemapResult {
  if (raw === null || raw.trim() === '') {
    return { json: null, dropped: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      json: null,
      dropped: 1,
      error: `An entity binding's field mappings could not be parsed and were dropped: ${asText(err)}`,
    };
  }
  if (!isMappingsShaped(parsed)) {
    return {
      json: null,
      dropped: 1,
      error: "An entity binding's field mappings were not in the expected { version, fields } shape and were dropped.",
    };
  }

  let dropped = 0;
  const fields: FieldMapping[] = [];
  for (const field of parsed.fields) {
    if (field.source?.kind !== 'question') {
      fields.push(field);
      continue;
    }
    const mapped = idMap.get(field.source.questionId);
    if (mapped === undefined) {
      dropped++;
      continue;
    }
    fields.push({ ...field, source: { kind: 'question', questionId: mapped } });
  }
  return { json: JSON.stringify({ ...parsed, fields }), dropped };
}

function isMappingsShaped(value: unknown): value is FieldMappings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Array.isArray((value as FieldMappings).fields);
}
