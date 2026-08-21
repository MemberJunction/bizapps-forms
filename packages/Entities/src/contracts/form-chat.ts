/**
 * The authoring chat: what a turn looks like, and what the assistant is allowed to do about it.
 *
 * ── WHY THE ASSISTANT RETURNS AN ACTION AND NOT JUST TEXT. ───────────────────────────────────
 * An author typing into this box is doing one of three things, and the difference matters because
 * two of them write to the database: asking a question ("what colour goes with navy?"), asking for
 * a form ("an RSVP with dietary needs"), or asking to change the one on screen ("make it warmer").
 * A reply-only assistant would answer all three in prose and change nothing, which is the failure
 * mode of every chatbot bolted onto a tool.
 *
 * So the model returns a REPLY plus a declared ACTION, and deterministic code performs the action.
 * The model never touches the database — the same split the whole authoring pipeline uses.
 *
 * ── WHAT IT CANNOT DO, STATED PLAINLY. ───────────────────────────────────────────────────────
 * Structural change arrived with `edit`: the form is read back OUT as a blueprint, the model
 * proposes a delta against the snapshot it was shown, and `planEdits` refuses anything that would
 * strand an answer. Sizing and alignment came with it, as `setLayout`. What is still outside the
 * boundary is publishing, share links, conditional show/hide rules, and adding or removing a
 * choice — those get `unsupported`, an honest "I can't do that" and the name of the control that
 * can, because a chat that silently ignores half its instructions is worse than one with a stated
 * boundary.
 *
 * The same boundary is spoken in one other place — the prompt template, which is metadata and
 * ships in a migration, so no import can reach it. {@link ASSISTANT_CAN} and
 * {@link ASSISTANT_CANNOT} below are what the panel shows the author, and they live here so that
 * at least the contract and the UI cannot drift apart; keeping them in step with the template is
 * still a manual act, and it has already gone stale twice.
 */
import { z } from 'zod';
import { editOperationSchema } from './form-edit';
import type { FormSnapshot } from './form-snapshot';

/**
 * Who said it. Mirrors `MJ: Conversation Details`.`Role` exactly, because that is where turns are
 * persisted and a second vocabulary would need mapping in both directions.
 */
export type FormChatRole = 'User' | 'AI' | 'Error';

/** One turn, as stored and as rendered. */
export interface FormChatTurn {
  role: FormChatRole;
  message: string;
  /** Present on an `Error` turn: what actually went wrong, for the author to act on. */
  error?: string;
  /**
   * When it was said. Read on the client, absent on the server.
   *
   * It exists to answer one question: is this conversation still WARM? An author who has just been
   * carried from the forms list into the form they described is mid-conversation and expects to
   * see it; the same author opening that form next week is not, and having the panel spring open
   * at them would be an interruption. The timestamp separates those two without any cross-page
   * state to keep in sync, and it decays on its own.
   */
  at?: Date;
  /**
   * The message that produced this turn, when the turn is a failure the author can retry.
   *
   * Client-only, like `at`. A failed send used to lose what was typed — the draft is cleared the
   * moment a message goes, so a network blip cost the author the whole sentence and their only
   * recourse was to remember it. Keeping it ON the failure is what lets the failure carry its own
   * way out, rather than a Retry button somewhere else having to guess which message it means.
   */
  retryOf?: string;
}

/**
 * What the assistant can do, in the author's words, for the panel's empty state.
 *
 * Deliberately a sentence rather than a list of operation names: an author does not think in
 * `updateOption`, and a capability list that enumerates the schema goes stale on every schema
 * change. It must stay true against the template's own "WHAT YOU STILL CANNOT DO" block — a list
 * that overstates is worse than no list, because the author spends a turn finding out.
 */
export const ASSISTANT_CAN =
  'build a form, change its questions and pages, reword a choice, restyle it, change sizes and alignment, add pictures, and open another of your forms';

/**
 * And what it cannot, with where the author can.
 *
 * Adding or removing a choice is the one that looks arbitrary and is not: `FormResponseAnswer`
 * stores the OPTION's id, so rewriting a question's option list would delete and recreate the rows
 * and every answer already naming that choice would stop resolving. Rewording keeps the id, and
 * therefore keeps the answers.
 */
export const ASSISTANT_CANNOT =
  'publish, make share links, set conditional show/hide rules, or add and remove choices — it will say where you can';

/**
 * How an attached picture travels with the message.
 *
 * In the message text, not in a new action parameter: a parameter is metadata, and metadata ships
 * in a migration — a marker in a string the action already receives makes the same feature work on
 * an instance that has not been re-seeded. It is also the honest representation of what happens,
 * because the assistant genuinely sees it: the line is part of the prompt, so a model asked to
 * "put this on the start screen" can tell that a "this" was supplied.
 *
 * Both halves live here rather than one in the client and one in the action, because a marker
 * written by one and parsed by the other is a contract whether or not anybody writes it down.
 */
export const ATTACHED_IMAGE_MARKER = '[attached image]';

/** The message with the attachment appended, in the form {@link attachedImageUrl} reads back. */
export function withAttachedImage(message: string, url: string): string {
  return `${message}\n\n${ATTACHED_IMAGE_MARKER} ${url.trim()}`;
}

/**
 * The picture attached to this message, if there is one and it is safe to store.
 *
 * `http`/`https` only. The URL is written to a screen's `MediaURL` and rendered into an `<img>`
 * on a public page, so a `javascript:` or `data:` value arriving from a client that decided to
 * write its own marker must not survive this function. It is the same rule the author-facing URL
 * box applies to a pasted link — this is a second door into the same field, not a looser one.
 */
export function attachedImageUrl(message: string | undefined | null): string | undefined {
  if (!message) {
    return undefined;
  }
  const at = message.lastIndexOf(ATTACHED_IMAGE_MARKER);
  if (at < 0) {
    return undefined;
  }
  const candidate = message.slice(at + ATTACHED_IMAGE_MARKER.length).trim().split(/\s/)[0];
  if (!candidate) {
    return undefined;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? candidate : undefined;
  } catch {
    // Not a URL at all — the author typed the words themselves, or the marker was truncated.
    return undefined;
  }
}

/**
 * How recently a thread must have been spoken in for the panel to open itself.
 *
 * Two minutes is longer than a navigation and much shorter than a return visit. The value only has
 * to sit in that gap, so it is not tuned finely.
 */
export const WARM_THREAD_MS = 2 * 60 * 1000;

/** Whether this thread was spoken in recently enough to still be the author's train of thought. */
export function isThreadWarm(turns: readonly FormChatTurn[], now: number): boolean {
  const last = turns[turns.length - 1]?.at;
  return last ? now - last.getTime() < WARM_THREAD_MS : false;
}

/**
 * What the assistant decided to do.
 *
 * - `none` — conversation only. Advice, questions, anything that changes nothing.
 * - `create` — build a new form from `brief`, through the existing generation pipeline.
 * - `restyle` — apply `cssVariables` to the form currently open.
 * - `image` — generate a picture from `imagePrompt` and put it on a screen of the open form.
 * - `edit` — change the STRUCTURE of the open form: add, reword, retype, move or remove questions
 *   and pages, reword a screen, set a layout token. Carried as `operations`, a delta against the
 *   handles the assistant was shown.
 * - `open` — take the author to another of their forms, named by `openFormId`. Navigation only:
 *   every WRITE still lands on whatever is on screen, so nothing changes that the author cannot
 *   see changing.
 * - `unsupported` — the author asked for something real that is not built yet. Distinct from
 *   `none` so the reply can say so and so the gap is countable rather than invisible.
 */
export type FormChatAction =
  | 'none'
  | 'create'
  | 'restyle'
  | 'image'
  | 'edit'
  | 'open'
  | 'unsupported';

/** The shape the chat prompt returns. Validated before anything acts on it. */
export const formChatResponseSchema = z.object({
  /** Markdown shown to the author. Always present, whatever the action. */
  reply: z.string().min(1),
  action: z.enum(['none', 'create', 'restyle', 'image', 'edit', 'open', 'unsupported']),
  /** `create` only: the brief handed to the generation pipeline. */
  brief: z.string().min(1).optional(),
  /** `restyle` only: `--mjf-*` overrides, validated against the theme vocabulary before persist. */
  cssVariables: z.record(z.string()).optional(),
  /**
   * `image` only: a short, concrete visual description — "a bowl of ramen on a wooden table, soft
   * daylight". A description, never an instruction: the image model is not being talked to.
   */
  imagePrompt: z.string().min(1).optional(),
  /**
   * `image` only: which screen it goes on. Defaults to the welcome screen, which is the one an
   * author almost always means and the only one a respondent sees before deciding to start.
   */
  imageTarget: z.enum(['welcome', 'ending']).optional(),
  /**
   * `edit` only: the delta, in the order it should be applied.
   *
   * Deliberately not validated against the FORM here — this schema only knows shape. Whether a
   * handle names anything, and whether the change is safe, is `planEdits`' job, and it needs the
   * snapshot to answer either.
   */
  operations: z.array(editOperationSchema).min(1).optional(),
  /** `open` only: which form to take the author to. One of the ids the assistant was listed. */
  openFormId: z.string().min(1).optional(),
});

export type FormChatResponse = z.infer<typeof formChatResponseSchema>;

/**
 * Parse a chat response from raw model output.
 *
 * Falls back to treating unparseable output as a plain reply rather than throwing. That is the one
 * place in this codebase where a validation failure degrades instead of retrying, and it is
 * deliberate: the author is waiting, the text is very often still useful, and a chat that shows an
 * error because the model forgot a JSON field is worse than one that shows the answer.
 */
export function parseFormChatResponse(raw: string): FormChatResponse {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = formChatResponseSchema.safeParse(JSON.parse(candidate.slice(start, end + 1)));
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // Fall through to the plain-text reading below.
    }
  }
  return { reply: trimmed || 'Sorry — I did not manage a reply to that.', action: 'none' };
}

/**
 * A compact description of the form on screen, handed to the assistant as context.
 *
 * Compact ON PURPOSE. The full blueprint would be thousands of tokens on every turn of every
 * conversation, and the assistant needs to know what the form IS, not every setting it carries.
 * Question types and prompts are what somebody asking "should I add a phone field?" is reasoning
 * about; validation rules and display orders are not.
 */
export interface FormChatContext {
  formId: string;
  name: string;
  /**
   * The form as the assistant reads it — pages, questions with handles, screens, colours.
   *
   * Rendered once here rather than assembled in the prompt template, so the thing the model sees
   * and the thing {@link planEdits} resolves against are built from ONE object. A template that
   * formatted this itself could drift from the handles the applier understands, and the failure
   * would be an edit landing on the wrong row.
   */
  description: string;
  /** The same form, structured — what an `edit` turn's handles are resolved against. */
  snapshot: FormSnapshot;
}

/** Render {@link FormChatContext} as the plain text the prompt template interpolates. */
export function describeFormForChat(context: FormChatContext | undefined): string {
  if (!context) {
    return 'The author is not looking at a form right now.';
  }
  return context.description;
}
