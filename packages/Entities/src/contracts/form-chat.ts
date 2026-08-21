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
 * ── WHAT IT CANNOT DO YET, STATED PLAINLY. ───────────────────────────────────────────────────
 * `restyle` and `image` are the only edits to an existing form. Structural changes — add a question, reword one,
 * split a page — need the form read back OUT as a blueprint so the model can propose a delta
 * against it, which is a genuinely separate piece of work (the reverse mapping). Asking for one
 * gets an honest "I can't do that yet" rather than a confident nothing, because a chat that
 * silently ignores half its instructions is worse than one with a stated boundary.
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
