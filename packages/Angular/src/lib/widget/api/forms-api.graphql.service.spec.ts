/**
 * The transport's one typed failure: an expired anonymous session.
 *
 * MJ's auth middleware rejects an expired session JWT with HTTP 401 and a GraphQL-shaped body
 * carrying a code — `{"errors":[{"message":"Token expired","extensions":{"code":"JWT_EXPIRED"}}]}`
 * (captured verbatim from a running host for bizapps-forms#123). Until this existed the transport
 * threw before it read that body, so the widget saw `Forms API request failed: HTTP 401` — a
 * message it could neither explain to a respondent nor tell apart from a network blip. An expired
 * session is different in kind: nothing sent with this token will ever succeed again, and the only
 * recovery is a new page. That distinction has to leave the transport as a type, not a string.
 */
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormsSaveResponseInput } from '@mj-biz-apps/forms-entities';
import { toRespondentDefinition, type PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import { FormUnavailableError, FORM_UNAVAILABLE_MESSAGE, ResponseNotSavedError, SessionExpiredError } from './forms-api.interface';
import { EXECUTE_REMOTE_OPERATION_MUTATION, FormsGraphQLApiService, isSessionExpired } from './forms-api.graphql.service';
import { FORMS_API_CONFIG, normalizeApiConfig } from './forms-api.config';

/** The real 401 body, byte for byte. */
const EXPIRED_BODY = JSON.parse(
  '{"errors":[{"message":"Token expired","extensions":{"code":"JWT_EXPIRED"}}]}',
);

/**
 * The other real 401 body — a request with no token at all — byte for byte.
 *
 * Parsed rather than written as a literal, like {@link EXPIRED_BODY} above, because that is how it
 * reaches the predicate in production: out of `response.json()`, untyped at the boundary. It also
 * has to be. `GraphQLEnvelope` is a weak type (every field optional), so TypeScript refuses any
 * object with no property in common with it — and having nothing in common with an envelope is the
 * entire point of this body.
 */
const AUTH_FAILURE_BODY = JSON.parse('{"error":"Authentication required"}');

describe('isSessionExpired', () => {
  it('recognises the JWT_EXPIRED code MJ sends for a lapsed session', () => {
    expect(isSessionExpired(EXPIRED_BODY)).toBe(true);
  });

  it('is not fooled by other 401 bodies, which are not GraphQL envelopes at all', () => {
    // No token / bad signature: `{"error":"Authentication required"}` / `{"error":"Authentication failed"}`.
    // Those mean something else (a preview embed with no token, a rotated key) and "your session
    // timed out" would be false for them.
    expect(isSessionExpired(AUTH_FAILURE_BODY)).toBe(false);
  });

  it('treats an ordinary GraphQL error as an ordinary failure', () => {
    expect(isSessionExpired({ errors: [{ message: 'Form unavailable (version-mismatch).' }] })).toBe(false);
    expect(isSessionExpired({ errors: [{ message: 'nope', extensions: { code: 'BAD_USER_INPUT' } }] })).toBe(false);
  });

  it('is false for a missing or non-JSON body', () => {
    expect(isSessionExpired(undefined)).toBe(false);
    expect(isSessionExpired({ data: { ExecuteRemoteOperation: null } })).toBe(false);
  });
});

describe('SessionExpiredError', () => {
  it('is an Error the widget can catch by type', () => {
    const err = new SessionExpiredError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SessionExpiredError');
    expect(err.message).toContain('session');
  });
});

// --- The Remote Operation transport (#303 Task 10c) ------------------------------------------------

/** One captured POST. */
interface Posted {
  url: string;
  headers: Record<string, string>;
  body: { query: string; variables: { operationKey: string; inputJSON: string; invokeMode: string } };
}

/** Stub `fetch` with one JSON response per call, recording what was posted. */
function stubFetch(...replies: { status?: number; body: unknown }[]): Posted[] {
  const posted: Posted[] = [];
  vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string }) => {
    posted.push({ url, headers: init.headers, body: JSON.parse(init.body) as Posted['body'] });
    const reply = replies[Math.min(posted.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  return posted;
}

/** The mutation's GraphQL envelope for an operation that ran and returned `output`. */
const ran = (output: unknown) => ({ data: { ExecuteRemoteOperation: { success: true, resultCode: 'SUCCESS', outputJSON: JSON.stringify(output), errorMessage: null } } });
/** ...and for one the server refused. */
const refused = (resultCode: string, errorMessage: string) => ({
  data: { ExecuteRemoteOperation: { success: false, resultCode, outputJSON: null, errorMessage } },
});

function service(token = 'jwt-1'): FormsGraphQLApiService {
  const injector = Injector.create({
    providers: [{ provide: FORMS_API_CONFIG, useValue: normalizeApiConfig({ graphqlUrl: 'https://api.example/graphql', token }) }],
  });
  return runInInjectionContext(injector, () => new FormsGraphQLApiService());
}

function published(): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Intake',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    automations: [],
    endScreens: [{ id: 'ko', screenType: 'Ending', title: 'No', displayOrder: 1, isDisqualification: true }],
    pages: [{ id: 'p1', displayOrder: 1, questions: [{ id: 'q1', type: 'ShortText', prompt: 'Name', isRequired: true, displayOrder: 1, options: [] }] }],
  };
}

const served = (overrides: Record<string, unknown> = {}) => ({
  FormVersionID: 'v1',
  DefinitionJSON: JSON.stringify(toRespondentDefinition(published())),
  ResumeJSON: null,
  CaptchaRequired: false,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FormsGraphQLApiService — every call is one attached Remote Operation', () => {
  it('posts ExecuteRemoteOperation with the key, the JSON input and invokeMode attached, keeping its headers', async () => {
    const posted = stubFetch({ body: ran(served()) });
    const api = service();
    await api.loadRespondentForm('the-slug');

    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe('https://api.example/graphql');
    expect(posted[0].body.query).toBe(EXECUTE_REMOTE_OPERATION_MUTATION);
    expect(posted[0].body.variables).toEqual({
      operationKey: 'Forms.GetRespondentForm',
      inputJSON: JSON.stringify({ Slug: 'the-slug' }),
      invokeMode: 'attached',
    });
    expect(posted[0].headers['Authorization']).toBe('Bearer jwt-1');
    expect(posted[0].headers['x-session-id']).toBe(api.sessionCorrelator());
  });

  it('an expired session is still the typed error, whichever operation met it', async () => {
    stubFetch({ status: 401, body: { errors: [{ message: 'Token expired', extensions: { code: 'JWT_EXPIRED' } }] } });
    await expect(service().loadRespondentForm('s')).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(service().saveResponse(saveInput())).rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe('loadRespondentForm — the projection is parsed with the contracts schema, or refused', () => {
  it('returns the parsed projection, its version and no resume on a first sitting', async () => {
    stubFetch({ body: ran(served()) });
    const load = await service().loadRespondentForm('s');
    expect(load.formVersionId).toBe('v1');
    expect(load.definition.pages[0].questions[0].prompt).toBe('Name');
    expect(load.resume).toBeUndefined();
    expect('endScreens' in load.definition).toBe(false);
  });

  it('strips a key the schema does not know, so a smuggled field never reaches the widget', async () => {
    const smuggled = { ...toRespondentDefinition(published()), endScreens: published().endScreens, automations: [{ id: 'x' }] };
    stubFetch({ body: ran(served({ DefinitionJSON: JSON.stringify(smuggled) })) });
    const load = await service().loadRespondentForm('s');
    expect('endScreens' in load.definition).toBe(false);
    expect('automations' in load.definition).toBe(false);
  });

  it.each([
    ['a refusal of the call (FORBIDDEN)', refused('FORBIDDEN', 'Not authorized for Forms.GetRespondentForm')],
    ['the engine\'s fixed refusal', refused('EXECUTION_ERROR', 'This form is not available.')],
    ['DefinitionJSON that is not JSON', ran(served({ DefinitionJSON: '{not json' }))],
    ['DefinitionJSON the schema rejects', ran(served({ DefinitionJSON: JSON.stringify({ name: 'x' }) }))],
    ['a definition served as a different version', ran(served({ FormVersionID: 'v2' }))],
    ['an output with no definition', ran({ FormVersionID: 'v1' })],
  ])('refuses %s with the one fixed sentence', async (_case, body) => {
    stubFetch({ body });
    const failure = await service().loadRespondentForm('s').catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(FormUnavailableError);
    expect((failure as FormUnavailableError).message).toBe(FORM_UNAVAILABLE_MESSAGE);
    expect((failure as FormUnavailableError).reason).toContain("'s'");
  });

  it('a checkpoint stub the projection leaves for a page nobody can see survives the schema, in place (Minor 6)', async () => {
    const withHiddenCheckpoint = published();
    withHiddenCheckpoint.pages.push(
      {
        id: 'hidden-checkpoint',
        displayOrder: 2,
        isPartialSubmitPoint: true,
        conditionalRule: { show: { all: [{ source: 'score', op: 'greaterThan', value: 5 }] } },
        questions: [{ id: 'secret', type: 'ShortText', prompt: 'Secret', isRequired: false, displayOrder: 1, options: [] }],
      },
      { id: 'p3', displayOrder: 3, questions: [{ id: 'q3', type: 'ShortText', prompt: 'Later', isRequired: false, displayOrder: 1, options: [] }] },
    );
    stubFetch({ body: ran(served({ DefinitionJSON: JSON.stringify(toRespondentDefinition(withHiddenCheckpoint)) })) });
    const load = await service().loadRespondentForm('s');
    expect(load.definition.pages.map((p) => p.id)).toEqual(['p1', 'hidden-checkpoint', 'p3']);
    expect(load.definition.pages[1]).toMatchObject({ isPartialSubmitPoint: true, questions: [] });
    expect(load.definition.pages[1].conditionalRule?.show).toBeDefined();
  });

  it('honours a top-level CaptchaRequired, so the server saying "captcha" always wins', async () => {
    stubFetch({ body: ran(served({ CaptchaRequired: true })) });
    expect((await service().loadRespondentForm('s')).definition.captchaRequired).toBe(true);
  });

  it('hands back a resume snapshot, and treats an unreadable one as a first sitting (logged)', async () => {
    const resume = { responseId: 'r1', status: 'Partial', formVersionId: 'v1', answers: [] };
    stubFetch({ body: ran(served({ ResumeJSON: JSON.stringify(resume) })) }, { body: ran(served({ ResumeJSON: '{broken' })) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = service();
    expect((await api.loadRespondentForm('s')).resume).toEqual(resume);
    expect((await api.loadRespondentForm('s')).resume).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("the draft served for 's' did not parse"), expect.anything());
  });
});

function saveInput(): FormsSaveResponseInput {
  return { Slug: 's', FormVersionID: 'v1', Mode: 'partial', ClientResponseID: 'c1', Answers: [{ QuestionID: 'q1', TextValue: 'x' }] };
}

describe('saveResponse — a result, or a refused call', () => {
  it('posts the input as the operation input and returns the result, refusals included', async () => {
    const result = { Success: false, ResponseID: null, Status: null, Outcome: 'continue', Errors: [{ QuestionID: 'q1', Message: 'This question is required.' }] };
    const posted = stubFetch({ body: ran(result) });
    expect(await service().saveResponse(saveInput())).toEqual(result);
    expect(posted[0].body.variables.operationKey).toBe('Forms.SaveResponse');
    expect(JSON.parse(posted[0].body.variables.inputJSON)).toEqual(saveInput());
  });

  it('a refused call is a ResponseNotSavedError carrying the code for the console', async () => {
    stubFetch({ body: refused('EXECUTION_ERROR', 'Forms.SaveResponse: ClientResponseID is required.') });
    const failure = await service().saveResponse(saveInput()).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ResponseNotSavedError);
    expect((failure as ResponseNotSavedError).reason).toContain('EXECUTION_ERROR');
  });

  it('a malformed Ending is dropped (logged) and the save still counts — the default ending shows instead (Minor 5)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const malformed = { ID: 'e1', Title: 'Thanks', Body: null, ButtonLabel: null, MediaURL: null, RedirectURL: null, SocialLinks: 'not-an-array', IsDisqualification: false };
    stubFetch({ body: ran({ Success: true, ResponseID: 'c1', Status: 'Complete', Outcome: 'ended', Ending: malformed, Errors: [] }) });
    const result = await service().saveResponse(saveInput());
    expect(result.Success).toBe(true);
    expect('Ending' in result).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('malformed Ending'));
  });

  it.each([
    ['a link that is not an object', ['https://x']],
    ['a link without a URL', [{ Platform: 'github' }]],
  ])('drops an Ending whose SocialLinks holds %s', async (_case, SocialLinks) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ending = { ID: 'e1', Title: 'Thanks', Body: null, ButtonLabel: null, MediaURL: null, RedirectURL: null, SocialLinks, IsDisqualification: false };
    stubFetch({ body: ran({ Success: true, ResponseID: 'c1', Status: 'Complete', Outcome: 'ended', Ending: ending, Errors: [] }) });
    expect('Ending' in (await service().saveResponse(saveInput()))).toBe(false);
  });

  it('keeps a well-formed Ending', async () => {
    const ending = { ID: 'e1', Title: 'Thanks', Body: 'b', ButtonLabel: null, MediaURL: null, RedirectURL: null, SocialLinks: [{ Platform: 'github', URL: 'https://g' }], IsDisqualification: false };
    stubFetch({ body: ran({ Success: true, ResponseID: 'c1', Status: 'Complete', Outcome: 'ended', Ending: ending, Errors: [] }) });
    expect((await service().saveResponse(saveInput())).Ending).toEqual(ending);
  });

  it('an output that is not a save result is refused rather than guessed at', async () => {
    stubFetch({ body: ran({ Success: true }) });
    await expect(service().saveResponse(saveInput())).rejects.toBeInstanceOf(ResponseNotSavedError);
  });
});
