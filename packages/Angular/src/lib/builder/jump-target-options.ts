/**
 * What the "Then → Go to" picker offers, and how a picked option survives a `<select>`.
 *
 * A `<select>` deals in strings, and a jump target is a tagged object. Encoding it as
 * `"question:q8"` here — in one place, with its inverse beside it — is what stops the encoding
 * being reinvented slightly differently in the template.
 *
 * FORWARD-ONLY is enforced by what the caller puts in the list, matching the resolver: a target
 * at or before the current position is inert there, so offering one would let an author write a
 * rule that silently never fires.
 */
import type { JumpTarget } from '@mj-biz-apps/forms-entities';

/** The heading a target sits under in the picker. */
export type JumpTargetGroup = 'Questions' | 'Sections' | 'Endings' | 'Finish';

export interface JumpTargetOption {
  /** The `<option>` value — see {@link targetValue}. */
  value: string;
  label: string;
  group: JumpTargetGroup;
  target: JumpTarget;
}

/** One target as an option value. `submit` names nothing, so it is its own whole value. */
export function targetValue(target: JumpTarget): string {
  return target.kind === 'submit' ? 'submit' : `${target.kind}:${target.id}`;
}

/**
 * The inverse, tolerant of anything a stale DOM could hand back.
 *
 * Returns `undefined` rather than guessing: a value this build does not understand must not
 * become a target pointing somewhere arbitrary.
 */
export function targetFromValue(value: string): JumpTarget | undefined {
  if (value === 'submit') {
    return { kind: 'submit' };
  }
  const split = value.indexOf(':');
  if (split <= 0) {
    return undefined;
  }
  const kind = value.slice(0, split);
  const id = value.slice(split + 1);
  if (id.length === 0) {
    return undefined;
  }
  if (kind === 'question' || kind === 'page' || kind === 'ending') {
    return { kind, id };
  }
  return undefined;
}

/** An item a jump may point at, as the host supplies it. */
export interface JumpDestination {
  id: string;
  label: string;
}

/**
 * Build the picker's options.
 *
 * `Finish` comes last and always exists: "stop asking, they are done" needs no configuration and
 * is the honest destination when an author wants the form over without choosing a screen — the
 * ending is then picked by the conditional/default logic that already exists.
 */
export function jumpTargetOptions(
  questions: ReadonlyArray<JumpDestination>,
  pages: ReadonlyArray<JumpDestination>,
  endings: ReadonlyArray<JumpDestination>,
): JumpTargetOption[] {
  const options: JumpTargetOption[] = [];
  for (const q of questions) {
    options.push({
      value: targetValue({ kind: 'question', id: q.id }),
      label: q.label,
      group: 'Questions',
      target: { kind: 'question', id: q.id },
    });
  }
  for (const p of pages) {
    options.push({
      value: targetValue({ kind: 'page', id: p.id }),
      label: p.label,
      group: 'Sections',
      target: { kind: 'page', id: p.id },
    });
  }
  for (const e of endings) {
    options.push({
      value: targetValue({ kind: 'ending', id: e.id }),
      label: e.label,
      group: 'Endings',
      target: { kind: 'ending', id: e.id },
    });
  }
  options.push({ value: 'submit', label: 'Submit the form', group: 'Finish', target: { kind: 'submit' } });
  return options;
}

/** The options grouped for rendering, skipping any group the caller supplied nothing for. */
export function groupedJumpTargets(
  options: ReadonlyArray<JumpTargetOption>,
): Array<{ group: JumpTargetGroup; options: JumpTargetOption[] }> {
  const order: JumpTargetGroup[] = ['Questions', 'Sections', 'Endings', 'Finish'];
  return order
    .map((group) => ({ group, options: options.filter((o) => o.group === group) }))
    .filter((g) => g.options.length > 0);
}

/**
 * The label for a STORED target, including one the picker no longer offers.
 *
 * A `<select>` whose value is absent from its options renders BLANK, so a rule pointing at a
 * deleted question would show an empty box on a row that reads perfectly well in the database.
 * Returning a "(no longer exists)" label lets the caller render the entry instead.
 */
export function storedTargetLabel(
  target: JumpTarget,
  options: ReadonlyArray<JumpTargetOption>,
): string {
  const known = options.find((o) => o.value === targetValue(target));
  if (known) {
    return known.label;
  }
  return target.kind === 'submit' ? 'Submit the form' : `(a ${target.kind} that no longer exists)`;
}
