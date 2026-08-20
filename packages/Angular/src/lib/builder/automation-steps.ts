/**
 * What actually happens when someone submits this form, in the reader's language.
 *
 * THE PROBLEM THIS SOLVES. The old tab rendered the `FormAutomation` row: a badge reading
 * `EntityBinding`, then `OnComplete · Sync · order 3`. Those are column values. They name our
 * storage, not the author's situation, and three of the four are meaningless to the person who
 * has to decide whether the thing is configured correctly.
 *
 * IT ALSO SHOWED THE WRONG ORDER. The list was sorted by `DisplayOrder` alone, but the server
 * sorts Sync BEFORE Async and only then by `DisplayOrder`
 * (`Server/src/public-submit/automation-plan.ts`, `byExecutionModeThenDisplayOrder`). An author who set an async step to
 * order 1 and a sync step to order 2 was shown a sequence that would never occur. The order is
 * re-derived here from the same two rules the runner applies, for the same reason
 * {@link shareState} re-derives a link's state from the facts the server gates on: a screen that
 * paraphrases the rules eventually contradicts them.
 *
 * Pure and framework-free so every sentence on the tab is unit-testable without Angular.
 */
import type { LegacyOnSubmitActionName } from '@mj-biz-apps/forms-entities';

/** The three things an author can attach, named for what they DO rather than for their column. */
export type StepKind = 'record' | 'action' | 'agent';

/** One configured automation, as the tab reads it out of the database. */
export interface AutomationFacts {
  id: string;
  name: string;
  targetType: 'Action' | 'Agent' | 'EntityBinding';
  executionMode: 'Async' | 'Sync';
  trigger: 'OnComplete' | 'OnCompleteOrPartial' | 'OnPartial';
  continueOnError: boolean;
  isActive: boolean;
  displayOrder: number;
  /** The entity a binding writes to; resolved by the caller from the binding record. */
  targetEntity?: string | null;
  /** An Action's or Agent's own description, when it has one worth showing. */
  description?: string | null;
}

/** One row of "when someone submits", ready to render. */
export interface SubmitStep {
  id: string;
  kind: StepKind;
  name: string;
  /**
   * Position in the sequence that will actually run, 1-based — or null when the step is off.
   *
   * Numbering only the live steps is the point: this list answers "what happens when someone
   * submits", and a disabled step is not part of that answer. Numbering it anyway would make the
   * sequence lie by exactly the number of things the author has switched off.
   */
  position: number | null;
  /** The badge: what kind of thing this is. */
  kindLabel: string;
  icon: string;
  /** One sentence describing what it does. */
  what: string;
  /** When it runs relative to the others. */
  timing: string;
  /** What its failure costs. */
  failure: string;
  /** Only present when the trigger is not the ordinary "on a finished submission". */
  trigger: string | null;
  enabled: boolean;
}

const KIND_BY_TARGET: Record<AutomationFacts['targetType'], StepKind> = {
  EntityBinding: 'record',
  Action: 'action',
  Agent: 'agent',
};

const KIND_LABEL: Record<StepKind, string> = {
  record: 'Saves a record',
  action: 'Runs an action',
  agent: 'Runs an AI agent',
};

const KIND_ICON: Record<StepKind, string> = {
  record: 'fa-database',
  action: 'fa-bolt',
  agent: 'fa-robot',
};

/** What the author is choosing between when they add something. Order is deliberate: see the tab. */
export const STEP_CHOICES: readonly { kind: StepKind; title: string; blurb: string; icon: string }[] = [
  {
    kind: 'record',
    title: 'Save the answers into a record',
    blurb:
      'Turn each submission into a real record — a person, an organisation, an application — that the rest of your system can already find, report on and act on.',
    icon: KIND_ICON.record,
  },
  {
    kind: 'action',
    title: 'Run an action',
    blurb: 'Send an email, create a task, call another system. Anything already built as an action.',
    icon: KIND_ICON.action,
  },
  {
    kind: 'agent',
    title: 'Run an AI agent',
    blurb: 'Hand the submission to an agent to read it, score it, summarise it or route it.',
    icon: KIND_ICON.agent,
  },
];

/**
 * The four hooks that run on every form that has configured nothing, in plain words.
 *
 * Keyed by the shared union rather than by loose strings, so adding a name to
 * `LEGACY_ON_SUBMIT_ACTION_NAMES` is a compile error here until it has been described. The
 * alternative — a lookup that silently falls back to the raw action name — is how a screen ends
 * up quietly showing `Forms: Upsert Respondent Person` to someone who has never heard the word
 * upsert.
 */
export const LEGACY_STEP_DESCRIPTIONS: Record<LegacyOnSubmitActionName, string> = {
  'Forms: Upsert Respondent Person': 'Find the person who submitted, or add them if they are new.',
  'Forms: Send Confirmation Email': 'Email the respondent to confirm you received it.',
  'Forms: Create Followup Task': 'Create a follow-up task so someone picks it up.',
  'Forms: Analyze Written Responses': 'Have AI read the written answers and summarise them.',
};

/**
 * Sort into the order the server will run them in: Sync first, then by DisplayOrder.
 *
 * Mirrors `byExecutionModeThenDisplayOrder` on the server, including the authoring-order
 * tiebreak — two steps can trivially share a DisplayOrder, and a displayed order that differs
 * from the run order for no visible reason is worse than no order at all.
 */
export function orderForExecution(facts: readonly AutomationFacts[]): AutomationFacts[] {
  return facts
    .map((f, authoringIndex) => ({ f, authoringIndex }))
    .sort((a, b) => {
      const byMode = modeRank(a.f) - modeRank(b.f);
      if (byMode !== 0) {
        return byMode;
      }
      const byOrder = a.f.displayOrder - b.f.displayOrder;
      return byOrder !== 0 ? byOrder : a.authoringIndex - b.authoringIndex;
    })
    .map(({ f }) => f);
}

function modeRank(f: AutomationFacts): number {
  return f.executionMode === 'Sync' ? 0 : 1;
}

/** The configured automations as the tab shows them, in run order. */
export function toSubmitSteps(facts: readonly AutomationFacts[]): SubmitStep[] {
  let position = 0;
  return orderForExecution(facts).map((f) => {
    const kind = KIND_BY_TARGET[f.targetType];
    if (f.isActive) {
      position += 1;
    }
    return {
      id: f.id,
      kind,
      name: f.name,
      position: f.isActive ? position : null,
      kindLabel: KIND_LABEL[kind],
      icon: KIND_ICON[kind],
      what: describeWhat(f, kind),
      timing: describeTiming(f),
      failure: describeFailure(f),
      trigger: describeTrigger(f),
      enabled: f.isActive,
    };
  });
}

/** What this step does, in one sentence. */
export function describeWhat(f: AutomationFacts, kind: StepKind): string {
  const own = f.description?.trim();
  if (own) {
    return own;
  }
  if (kind === 'record') {
    return f.targetEntity
      ? `Creates or updates a ${f.targetEntity} record from the answers.`
      : 'Creates or updates a record from the answers.';
  }
  return kind === 'agent'
    ? 'Hands the submission to this agent to work on.'
    : 'Runs this action against the submission.';
}

/**
 * When it runs relative to everything else.
 *
 * Note what this deliberately no longer says: that the respondent waits. Automations are
 * dispatched after the response is persisted and the reply has already gone back, so `Sync` means
 * "one after another", not "the person is watching a spinner". Copy that still promised a wait
 * would send authors optimising the wrong thing.
 */
export function describeTiming(f: AutomationFacts): string {
  return f.executionMode === 'Sync'
    ? 'Runs in order, after the step before it has finished.'
    : 'Starts straight away, alongside the other background steps.';
}

/** What this step's failure costs the ones after it. */
export function describeFailure(f: AutomationFacts): string {
  if (f.executionMode === 'Async') {
    return 'If it fails, nothing else is affected.';
  }
  return f.continueOnError
    ? 'If it fails, the steps after it still run.'
    : 'If it fails, the steps after it are skipped.';
}

/** The trigger, but only when it is not the ordinary one. */
export function describeTrigger(f: AutomationFacts): string | null {
  switch (f.trigger) {
    case 'OnPartial':
      return 'Only runs on part-way saves, never on the finished submission.';
    case 'OnCompleteOrPartial':
      return 'Also runs on part-way saves, not just on the finished submission.';
    default:
      return null;
  }
}

/**
 * The headline sentence above the list.
 *
 * Counts only what runs. An author with two steps configured and both switched off is told
 * nothing happens, because nothing does.
 */
export function submitSummary(steps: readonly SubmitStep[]): string {
  const live = steps.filter((s) => s.enabled).length;
  if (live === 0) {
    return 'Nothing happens after the answers are saved.';
  }
  return live === 1
    ? 'One thing happens after the answers are saved.'
    : `${live} things happen, in this order, after the answers are saved.`;
}

/**
 * A step's name with our own namespace trimmed off.
 *
 * The four built-ins are stored under their MJ Action names — `Forms: Send Confirmation Email` —
 * because that is what resolves them at dispatch. The author is already inside Forms looking at
 * one form, so the prefix is pure noise on screen while remaining load-bearing in the database.
 * Falls back to the original if trimming would leave nothing.
 */
export function stepDisplayName(name: string): string {
  return name.replace(/^Forms:\s*/i, '').trim() || name;
}

/** Whether a stored automation name is one of the built-in hooks, so it can be described in words. */
export function isLegacyStepName(name: string): name is LegacyOnSubmitActionName {
  return Object.prototype.hasOwnProperty.call(LEGACY_STEP_DESCRIPTIONS, name);
}
