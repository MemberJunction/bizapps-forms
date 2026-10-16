/**
 * A real `MjFormComponent`, constructed in this node suite and driven through the same methods its
 * template calls — so the respondent flows (knockouts, submits, autosave refusals, Preview) are
 * EXECUTED rather than read back out of the source (#303 DW18).
 *
 * No TestBed and no template: the component is built in an injection context with a fake transport,
 * and the harness subclass exposes the protected members the template would bind to. What only the
 * template can show — which `@switch` branch renders, the CSS — stays with the template specs and
 * `ngc`'s strict template check.
 *
 * Specs that use this must `import '@angular/compiler'` first (see vitest.config.ts).
 */
import { ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { SIGNAL } from '@angular/core/primitives/signals';
import type { FormsSaveResponseInput, FormsSaveResponseOutput, FormsRespondentEnding } from '@mj-biz-apps/forms-entities';
import {
  toRespondentDefinition,
  type PublishedFormDefinition,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities/contracts';

import { MjFormComponent } from '../mj-form.component';
import { FORMS_API_SERVICE, type IFormsApiService, type RespondentFormLoad } from '../api/forms-api.interface';
import { FORMS_API_CONFIG, normalizeApiConfig } from '../api/forms-api.config';
import { FORMS_UPLOAD_SERVICE } from '../api/form-upload.interface';
import { FormsMockUploadService } from '../api/form-upload.mock.service';
import { FormUploadStore } from '../core/upload-store';
import type { FormRuntime } from '../core/form-runtime';

/** What the server would answer one save with. */
export type Responder = (input: FormsSaveResponseInput) => FormsSaveResponseOutput | Promise<FormsSaveResponseOutput>;

/** A fake `IFormsApiService` that records every call. */
export class FakeFormsApi implements IFormsApiService {
  public readonly loads: string[] = [];
  public readonly saves: FormsSaveResponseInput[] = [];

  constructor(
    public load: () => Promise<RespondentFormLoad>,
    public respond: Responder,
  ) {}

  public async loadRespondentForm(distributionSlug: string): Promise<RespondentFormLoad> {
    this.loads.push(distributionSlug);
    return this.load();
  }

  public async saveResponse(input: FormsSaveResponseInput): Promise<FormsSaveResponseOutput> {
    this.saves.push(input);
    return this.respond(input);
  }

  public sessionCorrelator(): string {
    return 'session-1';
  }

  /** The saves of one mode, in order. */
  public savesOf(mode: FormsSaveResponseInput['Mode']): FormsSaveResponseInput[] {
    return this.saves.filter((save) => save.Mode === mode);
  }
}

/** The component with its template-facing members opened up. */
export class MjFormHarness extends MjFormComponent {
  public get phaseNow(): string {
    return this.phase();
  }
  public get rt(): FormRuntime {
    const rt = this.runtime();
    if (!rt) {
      throw new Error('MjFormHarness: no runtime — the form has not loaded.');
    }
    return rt;
  }
  public get runtimeOrNull(): FormRuntime | null {
    return this.runtime();
  }
  public get bannerText(): string {
    return this.errorText();
  }
  public get autosaveNow(): string {
    return this.autosaveStatus();
  }
  public get resultNow(): FormsSaveResponseOutput | null {
    return this.result();
  }
  public get endingShown(): string | undefined {
    return this.activeEndingScreen()?.id;
  }
  public get endingTitle(): string | undefined {
    return this.activeEndingScreen()?.title;
  }
  public get endingMedia(): string | undefined {
    return this.activeEndingScreen()?.mediaURL;
  }
  public get isScreenedOut(): boolean {
    return this.screenedOut();
  }
  public get confirmation(): string {
    return this.confirmationMessage();
  }
  public get saveNoticeShown(): boolean {
    return this.saveNotice();
  }
  public get canSubmitNow(): boolean {
    return this.submitAllowed();
  }
  public progress(): void {
    this.onProgress();
  }
  public commit(): void {
    this.onCommit();
  }
  public submit(): Promise<void> {
    return this.onSubmit();
  }
  public solveCaptcha(token: string): void {
    this.onTurnstileSolved(token);
  }
  /** The error page's "Try again": a second load while the first may still be in flight. */
  public reload(): void {
    this.retry();
  }
}

/** Host events the widget dispatched, by name. */
export interface HostRecorder {
  readonly events: { name: string; detail: unknown }[];
}

export interface MountOptions {
  api: FakeFormsApi;
  /** Set for Preview: the author's full draft, handed in as the `definition` input. */
  definition?: PublishedFormDefinition;
  slug?: string;
  graphqlUrl?: string;
  turnstileSiteKey?: string;
}

/** Build the component, set its inputs, and run `ngOnInit` (the load). */
export async function mountForm(options: MountOptions): Promise<{ form: MjFormHarness; host: HostRecorder }> {
  const { form, host, loaded } = startMount(options);
  await loaded;
  return { form, host };
}

/** {@link mountForm} without waiting for the load: the component is handed back while it is on the wire. */
export function startMount(options: MountOptions): { form: MjFormHarness; host: HostRecorder; loaded: Promise<void> } {
  const host: HostRecorder = { events: [] };
  const element = {
    style: { setProperty: () => undefined, removeProperty: () => undefined },
    dispatchEvent: (event: Event) => {
      host.events.push({ name: event.type, detail: (event as CustomEvent).detail });
      return true;
    },
    querySelector: () => null,
    appendChild: () => undefined,
  };
  const injector = Injector.create({
    providers: [
      { provide: FORMS_API_SERVICE, useValue: options.api },
      {
        provide: FORMS_API_CONFIG,
        useValue: normalizeApiConfig({ graphqlUrl: options.graphqlUrl ?? 'https://api.example/graphql', turnstileSiteKey: options.turnstileSiteKey }),
      },
      { provide: ElementRef, useValue: new ElementRef(element) },
      { provide: FORMS_UPLOAD_SERVICE, useClass: FormsMockUploadService },
      FormUploadStore,
    ],
  });
  const form = runInInjectionContext(injector, () => new MjFormHarness());
  // Inputs are set through Angular's INTERNAL input-signal node (`SIGNAL` from
  // `@angular/core/primitives/signals`, then `applyValueToInputSignal`) — the hook Angular's own
  // renderer uses, because there is no template here to bind them and `input()` signals are
  // read-only. It is not public API: if an Angular upgrade renames or removes it, EVERY executing
  // widget spec fails here at once, and this is the line to fix (fix round 1, Minor 7).
  const slug = form.distributionSlug[SIGNAL];
  slug.applyValueToInputSignal(slug, options.slug ?? 'the-slug');
  if (options.definition) {
    const definition = form.definitionInput[SIGNAL];
    definition.applyValueToInputSignal(definition, options.definition);
  }
  return { form, host, loaded: form.ngOnInit() };
}

/** A live load of `full`'s respondent projection, as `Forms.GetRespondentForm` serves it. */
export function servedAs(full: PublishedFormDefinition): () => Promise<RespondentFormLoad> {
  return async () => {
    const definition = toRespondentDefinition(full);
    return { formVersionId: definition.formVersionId, definition };
  };
}

// --- A screening form ---------------------------------------------------------------------------

export const KO_ENDING: FormsRespondentEnding = {
  ID: 'ko',
  Title: 'Not eligible',
  Body: 'You must be 18 or over.',
  ButtonLabel: null,
  MediaURL: null,
  RedirectURL: null,
  SocialLinks: [],
  IsDisqualification: true,
};

export const THANKS_ENDING: FormsRespondentEnding = {
  ID: 'thanks',
  Title: 'Thanks',
  Body: null,
  ButtonLabel: null,
  MediaURL: '/forms/asset/a1137587-b23a-4f0d-9049-efc0bdcfc59a',
  RedirectURL: null,
  SocialLinks: [{ Platform: 'linkedin', URL: 'https://example.com/in' }, { Platform: 'not-a-platform', URL: 'https://x' }],
  IsDisqualification: false,
};

function question(id: string, extra: Partial<PublishedFormQuestion> = {}): PublishedFormQuestion {
  return { id, type: 'ShortText', prompt: `Prompt ${id}`, isRequired: false, displayOrder: 1, options: [], ...extra };
}

/**
 * Age (a knockout below 18) and a name on page one, a comment on page two (a partial-submit point
 * before it), and a knockout ending plus a default ending. The knockout jump is exactly what the
 * respondent projection drops — the live widget never sees it.
 */
export function screeningForm(extra: { captcha?: boolean } = {}): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'version-1',
    name: 'Screening',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: extra.captcha === true },
    styleTokens: { cssVariables: {} },
    automations: [],
    pages: [
      {
        id: 'p1',
        displayOrder: 1,
        isPartialSubmitPoint: true,
        conditionalRule: {
          jump: [{ when: { all: [{ questionId: 'age', op: 'lessThan', value: 18 }] }, target: { kind: 'ending', id: 'ko' } }],
        },
        questions: [question('age', { type: 'Number', prompt: 'Your age', displayOrder: 1 }), question('name', { prompt: 'Your name', displayOrder: 2 })],
      },
      { id: 'p2', displayOrder: 2, questions: [question('comment', { prompt: 'Anything else?', displayOrder: 1 })] },
    ],
    endScreens: [
      { id: 'ko', screenType: 'Ending', title: 'Not eligible', body: 'You must be 18 or over.', displayOrder: 1, isDisqualification: true },
      { id: 'thanks', screenType: 'Ending', title: 'Thanks', displayOrder: 2, isDefault: true },
    ],
  };
}

/** The server, for {@link screeningForm}: a partial with age < 18 ends (unsealed), a final seals it. */
export function screeningServer(input: FormsSaveResponseInput): FormsSaveResponseOutput {
  const age = input.Answers.find((answer) => answer.QuestionID === 'age')?.NumericValue;
  const knockedOut = typeof age === 'number' && age < 18;
  const final = input.Mode === 'final';
  if (knockedOut) {
    return {
      Success: true,
      ResponseID: input.ClientResponseID,
      Status: final ? 'Disqualified' : 'Partial',
      Outcome: 'ended',
      Ending: KO_ENDING,
      ConfirmationMessage: 'Not eligible\n\nYou must be 18 or over.',
      Errors: [],
    };
  }
  return final
    ? { Success: true, ResponseID: input.ClientResponseID, Status: 'Complete', Outcome: 'ended', Ending: THANKS_ENDING, ConfirmationMessage: 'Thanks', Errors: [] }
    : { Success: true, ResponseID: input.ClientResponseID, Status: 'Partial', Outcome: 'continue', Errors: [] };
}

/** A refusal of one save, as `Forms.SaveResponse` answers it. */
export function refusal(message: string, questionId: string | null = null): FormsSaveResponseOutput {
  return { Success: false, ResponseID: null, Status: null, Outcome: 'continue', Errors: [{ QuestionID: questionId, Message: message }] };
}

/** A promise resolved from outside — to hold a save on the wire while something else happens. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
