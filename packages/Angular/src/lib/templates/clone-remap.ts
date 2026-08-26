/**
 * Rewriting the question ids embedded in a form's JSON columns when the form is copied.
 *
 * THE TRAP THIS EXISTS FOR. Copying a form row-by-row gets you a form that looks right and is
 * quietly broken, because several columns store *references* to question ids rather than
 * structure:
 *
 *   - `FormPage.ConditionalRule`, `FormQuestion.ConditionalRule`, `FormScreen.ConditionalRule`
 *     and `FormAutomation.ConditionalRule` — `{ show / require: { all | any: [{ questionId, op,
 *     value }] }, jump: [{ when, toPageId }] }` (question ids in the groups, page ids in jumps)
 *   - `FormEntityBinding.FieldMappings` — `{ version, fields: [{ source: { questionId } }] }`
 *
 * Copy those verbatim and the new form's branching points at the OLD form's questions. Nothing
 * errors. The evaluator simply never finds an answer for the id it was given, every condition
 * comes back false, and the questions behind them are hidden from every respondent forever —
 * which the author discovers, if ever, as missing answers weeks later.
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
} from '@mj-biz-apps/forms-entities';

export interface RemapResult {
  json: string | null;
  /** How many question references were discarded because they had no counterpart. */
  dropped: number;
  /** Set when the stored JSON could not be used at all; the payload is dropped, never kept. */
  error?: string;
}

export function remapConditionalRule(
  raw: string | null,
  idMap: ReadonlyMap<string, string>,
  /** Page-id counterparts, for `jump.toPageId` — jumps are dropped (and counted) without it. */
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

  const show = remapGroup(parsed.show);
  const require = remapGroup(parsed.require);
  const jump: ConditionalJumpRule[] = [];
  for (const rule of parsed.jump ?? []) {
    const when = remapGroup(rule.when);
    const toPageId = pageIdMap?.get(rule.toPageId);
    // A jump missing either half in the copy would point at the OLD form's page — the exact
    // hidden-forever failure this module exists to prevent. Dropped and counted, like a
    // dangling question reference.
    if (when === undefined || toPageId === undefined) {
      dropped++;
      continue;
    }
    jump.push({ when, toPageId });
  }

  const result: ConditionalRule = {};
  if (show !== undefined) {
    result.show = show;
  }
  if (require !== undefined) {
    result.require = require;
  }
  if (jump.length > 0) {
    result.jump = jump;
  }
  if (Object.keys(result).length === 0) {
    return { json: null, dropped };
  }
  return { json: JSON.stringify(result), dropped };
}

type GroupShape = { all?: ConditionalCondition[]; any?: ConditionalCondition[] };
type RuleShape = {
  show?: GroupShape;
  require?: GroupShape;
  jump?: Array<{ when: GroupShape; toPageId: string }>;
};

/**
 * A stored rule is usable only if it is a plain object whose group arms are arrays (and whose
 * jump list, if any, is an array of `{ when, toPageId }`). Anything else (an array, a string,
 * a number, `{show: 5}`) is data we cannot rewrite, and copying it verbatim would carry the
 * source form's question ids into the copy.
 */
function isRuleShaped(value: unknown): value is RuleShape {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const rule = value as RuleShape;
  if (!isGroupShaped(rule.show) || !isGroupShaped(rule.require)) {
    return false;
  }
  if (rule.jump === undefined) {
    return true;
  }
  if (!Array.isArray(rule.jump)) {
    return false;
  }
  return rule.jump.every(
    (j) =>
      typeof j === 'object' &&
      j !== null &&
      typeof j.toPageId === 'string' &&
      isGroupShaped(j.when) &&
      j.when !== undefined,
  );
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
