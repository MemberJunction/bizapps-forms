/**
 * A form, as the authoring assistant sees it and points at it.
 *
 * ── HANDLES, NOT IDS. ────────────────────────────────────────────────────────────────────────
 * Every page, question, option and screen carries a short handle — `p1`, `q3`, `o2`, `s1` — and
 * the model only ever sees and names those. Three things follow, and they are the reason this
 * shape exists rather than the model being handed the rows:
 *
 *   1. AN INVENTED HANDLE RESOLVES TO NOTHING. An invented GUID might name a real row in somebody
 *      else's form. The handle space is closed to what this turn was actually shown, so the model
 *      cannot address anything it was not given — which is a stronger property than validating an
 *      id after the fact, and one that needs no second rule to keep right.
 *   2. IDS SURVIVE EDITS. The model proposes a DELTA against handles, never a replacement form, so
 *      a question keeps its row and its `FormResponseAnswer` rows keep pointing at it. A rewrite
 *      would orphan every answer already collected.
 *   3. IT FITS. Forty questions of GUIDs is roughly 1,500 tokens on EVERY turn, alongside ten
 *      turns of history. Forty handles is forty.
 *
 * The map is per-turn: built when the form is read, used to apply that turn's operations, thrown
 * away. Nothing persists a handle, and nothing may — they are stable only for as long as the
 * description the model is reading.
 */

/** One choice on a choice-style question. */
export interface SnapshotOption {
  handle: string;
  id: string;
  label: string;
}

/** One question, with the counts the assistant needs to reason about changing it. */
export interface SnapshotQuestion {
  handle: string;
  id: string;
  type: string;
  prompt: string;
  isRequired: boolean;
  /**
   * How many people have already answered this question.
   *
   * Present so the ASSISTANT can decline a destructive edit itself, with a reason, rather than
   * proposing it and being refused by the applier — an author reading "I won't, 32 people have
   * answered that" is better served than one reading an apology for a rejected operation.
   */
  answerCount: number;
  options: SnapshotOption[];
}

/** One page (section), holding ordered questions. */
export interface SnapshotPage {
  handle: string;
  id: string;
  title?: string;
  questions: SnapshotQuestion[];
}

/** A welcome or ending screen. */
export interface SnapshotScreen {
  handle: string;
  id: string;
  /**
   * Which screen this is.
   *
   * NOT called `kind`: `SnapshotTarget` uses `kind` as its discriminator, and a row carrying its
   * own `kind` silently overwrote it when spread — so `resolveHandle('s1')` came back as a target
   * of kind `welcome`, which nothing matches, and every screen operation was refused as though the
   * handle named the wrong sort of thing.
   */
  role: 'welcome' | 'ending';
  title?: string;
  isDefault: boolean;
}

/** Everything the assistant is told about the form on screen. */
export interface FormSnapshot {
  formId: string;
  name: string;
  status: string;
  /** Responses to the form as a whole. Per-question counts live on the question. */
  responseCount: number;
  pages: SnapshotPage[];
  screens: SnapshotScreen[];
  cssVariables: Record<string, string>;
}

/** A form's rows as the caller read them, before handles exist. */
export interface FormSnapshotInput {
  formId: string;
  name: string;
  status: string;
  responseCount: number;
  cssVariables: Record<string, string>;
  pages: ReadonlyArray<{
    id: string;
    title?: string;
    questions: ReadonlyArray<{
      id: string;
      type: string;
      prompt: string;
      isRequired: boolean;
      answerCount: number;
      options: ReadonlyArray<{ id: string; label: string }>;
    }>;
  }>;
  screens: ReadonlyArray<{
    id: string;
    role: 'welcome' | 'ending';
    title?: string;
    isDefault: boolean;
  }>;
}

/**
 * Mint handles for every row, in document order.
 *
 * Numbering is PER FORM and not per page — `q3` names one question for the whole turn however many
 * pages it crosses. Per-page numbering would make a handle ambiguous the instant an operation
 * moved a question, which is precisely one of the operations this exists to serve.
 */
export function buildFormSnapshot(input: FormSnapshotInput): FormSnapshot {
  let pageN = 0;
  let questionN = 0;
  let optionN = 0;
  let screenN = 0;
  return {
    formId: input.formId,
    name: input.name,
    status: input.status,
    responseCount: input.responseCount,
    cssVariables: { ...input.cssVariables },
    pages: input.pages.map((page) => ({
      handle: `p${++pageN}`,
      id: page.id,
      ...(page.title === undefined ? {} : { title: page.title }),
      questions: page.questions.map((question) => ({
        handle: `q${++questionN}`,
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        isRequired: question.isRequired,
        answerCount: question.answerCount,
        options: question.options.map((option) => ({
          handle: `o${++optionN}`,
          id: option.id,
          label: option.label,
        })),
      })),
    })),
    screens: input.screens.map((screen) => ({
      handle: `s${++screenN}`,
      id: screen.id,
      role: screen.role,
      ...(screen.title === undefined ? {} : { title: screen.title }),
      isDefault: screen.isDefault,
    })),
  };
}

/** Anything in the snapshot a handle can name. */
export type SnapshotTarget =
  | ({ kind: 'page' } & SnapshotPage)
  | ({ kind: 'question' } & SnapshotQuestion)
  | ({ kind: 'option' } & SnapshotOption)
  | ({ kind: 'screen' } & SnapshotScreen);

/** The thing this handle names, or undefined when the model made it up. */
/**
 * The count a question carries when the answer scan could not establish a real number.
 *
 * `loadFormSnapshot` sets this when its answer read fails or hits its row cap, so that the delete
 * gate treats the question as answered — failing closed, which is the only safe direction. It is
 * `MAX_SAFE_INTEGER` because every gate here is a `> 0` comparison and a sentinel that compares
 * correctly needs no special case at the point of decision.
 *
 * It DOES need one at the point of DISPLAY. Rendered raw it reached both the prompt and the
 * author as "9007199254740991 answers", which is worse than saying nothing: it is a number, so it
 * reads as a fact. {@link describeAnswerCount} and {@link describeAnswerers} are the only
 * sanctioned way to put a count into text.
 */
export const ANSWER_COUNT_UNKNOWN = Number.MAX_SAFE_INTEGER;

/** Whether a count is the fail-closed sentinel rather than a real number. */
export function isAnswerCountKnown(count: number): boolean {
  return count < ANSWER_COUNT_UNKNOWN;
}

/** `"3 answers"`, `"1 answer"`, or `"answers"` when the number could not be established. */
export function describeAnswerCount(count: number): string {
  if (!isAnswerCountKnown(count)) {
    return 'answers';
  }
  return `${count} ${count === 1 ? 'answer' : 'answers'}`;
}

/** `"3 people have"`, `"1 person has"`, or `"people have"` when the number is unknown. */
export function describeAnswerers(count: number): string {
  if (!isAnswerCountKnown(count)) {
    return 'people have';
  }
  return `${count} ${count === 1 ? 'person has' : 'people have'}`;
}

export function resolveHandle(snapshot: FormSnapshot, handle: string): SnapshotTarget | undefined {
  for (const page of snapshot.pages) {
    if (page.handle === handle) {
      return { kind: 'page', ...page };
    }
    for (const question of page.questions) {
      if (question.handle === handle) {
        return { kind: 'question', ...question };
      }
      for (const option of question.options) {
        if (option.handle === handle) {
          return { kind: 'option', ...option };
        }
      }
    }
  }
  for (const screen of snapshot.screens) {
    if (screen.handle === handle) {
      return { kind: 'screen', ...screen };
    }
  }
  return undefined;
}

/** Render the snapshot as the plain text the prompt interpolates. */
export function describeFormSnapshot(snapshot: FormSnapshot): string {
  const lines: string[] = [`Form "${snapshot.name}" · ${snapshot.status} · ${snapshot.responseCount} responses`];
  for (const page of snapshot.pages) {
    lines.push('', `PAGE ${page.handle}${page.title ? ` "${page.title}"` : ''}`);
    for (const question of page.questions) {
      lines.push(`  ${question.handle} [${question.type}] ${question.prompt}${describeFlags(question)}`);
      if (question.options.length > 0) {
        lines.push(`       ${question.options.map((o) => `${o.handle} ${o.label}`).join('   ')}`);
      }
    }
  }
  for (const screen of snapshot.screens) {
    const role = screen.role === 'welcome' ? 'START' : 'FINISH';
    const fallback = screen.isDefault ? ' (default)' : '';
    lines.push('', `${role} ${screen.handle}${fallback} "${screen.title ?? ''}"`);
  }
  // COLOURS and LAYOUT are separate blocks on purpose. Sizing, alignment and corner radius stay
  // the house decision unless the author asks for them by name, and a model shown one undivided
  // list of tokens has no reason to treat half of them differently.
  const colours = tokenBlock(snapshot.cssVariables, (name) => !LAYOUT_TOKEN_NAMES.includes(name));
  const layout = tokenBlock(snapshot.cssVariables, (name) => LAYOUT_TOKEN_NAMES.includes(name));
  if (colours) {
    lines.push('', 'COLOURS', colours);
  }
  if (layout) {
    lines.push('', 'LAYOUT (only change these when the author asks for them by name)', layout);
  }
  return lines.join('\n');
}

/**
 * The tokens that are LAYOUT rather than palette.
 *
 * Named here rather than imported from `default-theme` because that module's list exists to
 * protect them during a MERGE, and this one exists to describe them to a model. Same five names,
 * two different jobs — and `themeTokenNames`-style agreement between the two is asserted in the
 * spec so they cannot drift apart silently.
 */
const LAYOUT_TOKEN_NAMES: readonly string[] = [
  '--mjf-title-size',
  '--mjf-title-align',
  '--mjf-question-size',
  '--mjf-question-align',
  '--mjf-btn-radius',
];

/** Indented `name: value` lines for the tokens matching `keep`, or empty when there are none. */
function tokenBlock(tokens: Record<string, string>, keep: (name: string) => boolean): string {
  return Object.entries(tokens)
    .filter(([name]) => keep(name))
    .map(([name, value]) => `  ${name}: ${value}`)
    .join('\n');
}

/** The parenthetical after a question: what it demands, and what it already holds. */
function describeFlags(question: SnapshotQuestion): string {
  const flags: string[] = [];
  if (question.isRequired) {
    flags.push('required');
  }
  if (question.answerCount > 0) {
    flags.push(describeAnswerCount(question.answerCount));
  }
  return flags.length > 0 ? `  (${flags.join(', ')})` : '';
}

/** One of the author's forms, as the assistant is shown it. */
export interface FormListEntry {
  handle: string;
  id: string;
  name: string;
  status: string;
}

/**
 * Mint handles for the author's forms.
 *
 * Same reasoning as questions: a raw id in front of the model is an id it can guess at, and the
 * `open` action turns a handle back into one exactly once, server-side. `f1`, `f2` — a separate
 * letter from pages and questions so a handle can never be ambiguous about what it names.
 */
export function buildFormList(
  forms: ReadonlyArray<{ id: string; name: string; status: string }>,
): FormListEntry[] {
  return forms.map((form, index) => ({
    handle: `f${index + 1}`,
    id: form.id,
    name: form.name,
    status: form.status,
  }));
}

/** Render the list as the plain text the prompt interpolates. */
export function describeFormList(forms: readonly FormListEntry[]): string {
  if (forms.length === 0) {
    return 'They have no forms yet.';
  }
  return [
    'Their forms — name one of these handles in `openFormId` to take them to it:',
    ...forms.map((f) => `  ${f.handle} "${f.name}" (${f.status})`),
  ].join('\n');
}
