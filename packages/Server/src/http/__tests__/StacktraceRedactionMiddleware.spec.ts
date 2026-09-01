/**
 * No GraphQL error response leaves this host with `extensions.stacktrace` on it.
 *
 * Apollo attaches the stack — absolute server paths, pinned dependency versions — to every error
 * unless `NODE_ENV` is `production` or `test`, and MJ's `buildApolloServer` never overrides that
 * default. So a dev host, or a production host whose `NODE_ENV` was mis-set, hands thirteen frames
 * of filesystem layout to whoever sends one malformed query with the anonymous session a public
 * form link mints for them (issue #119). The plugin is exercised through the seam MJ calls it
 * through — `GetApolloPlugins()` → `requestDidStart()` → `willSendResponse()` — with the response
 * shape Apollo 5 hands a plugin after `formatErrors` has run.
 *
 * `@memberjunction/server` is mocked because importing it for real runs `loadConfig()` at module
 * load and throws without a live MJ config (same reason `RequestIdentityMiddleware.spec.ts` does).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {},
}));

import { StacktraceRedactionMiddleware } from '../StacktraceRedactionMiddleware';

type Plugin = ReturnType<StacktraceRedactionMiddleware['GetApolloPlugins']>[number];
type RequestContext = Parameters<NonNullable<Plugin['requestDidStart']>>[0];
type Listener = NonNullable<Awaited<ReturnType<NonNullable<Plugin['requestDidStart']>>>>;
type ResponseBody = RequestContext['response']['body'];

const STACK = [
  'GraphQLError: Cannot query field "message" on type "FormSubmissionResultType".',
  '    at Object.Field (/srv/app/node_modules/.pnpm/graphql@16.14.2/node_modules/graphql/validation/rules/FieldsOnCorrectTypeRule.js:80:13)',
  '    at processGraphQLRequest (/srv/app/node_modules/.pnpm/@apollo+server@5.4.0/node_modules/@apollo/server/dist/esm/requestPipeline.js:119:23)',
];

/** Run one response through the plugin exactly as Apollo would, and hand back what it would send. */
async function send(body: ResponseBody): Promise<ResponseBody> {
  const plugin = new StacktraceRedactionMiddleware().GetApolloPlugins()[0];
  const requestContext = { response: { body } } as RequestContext;
  const listener = (await plugin.requestDidStart?.(requestContext)) as Listener;
  await listener.willSendResponse?.(requestContext);
  return requestContext.response.body;
}

describe('StacktraceRedactionMiddleware', () => {
  it('removes extensions.stacktrace from every error and keeps everything else', async () => {
    const body = await send({
      kind: 'single',
      singleResult: {
        errors: [
          {
            message: 'Cannot query field "message" on type "FormSubmissionResultType".',
            locations: [{ line: 1, column: 3 }],
            extensions: { code: 'GRAPHQL_VALIDATION_FAILED', stacktrace: STACK },
          },
          {
            message: 'Token expired',
            extensions: { code: 'JWT_EXPIRED', stacktrace: STACK },
          },
        ],
      },
    });

    expect(body.kind).toBe('single');
    const errors = body.kind === 'single' ? body.singleResult.errors ?? [] : [];
    expect(errors).toHaveLength(2);
    for (const error of errors) {
      expect(error.extensions).not.toHaveProperty('stacktrace');
    }
    expect(errors[0]).toMatchObject({
      message: 'Cannot query field "message" on type "FormSubmissionResultType".',
      locations: [{ line: 1, column: 3 }],
      extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
    });
    expect(errors[1]).toMatchObject({ message: 'Token expired', extensions: { code: 'JWT_EXPIRED' } });
    expect(JSON.stringify(body)).not.toMatch(/node_modules|graphql@|apollo\+server@/);
  });

  it('leaves an error that carries no extensions exactly as it was', async () => {
    const error = { message: 'plain', locations: [{ line: 2, column: 5 }] };
    const body = await send({ kind: 'single', singleResult: { errors: [error] } });

    const errors = body.kind === 'single' ? body.singleResult.errors ?? [] : [];
    expect(errors[0]).toBe(error);
  });

  it('does not touch a successful response', async () => {
    const singleResult = { data: { PublishedForm: { name: 'Contact us' } } };
    const body = await send({ kind: 'single', singleResult });

    expect(body.kind === 'single' && body.singleResult).toBe(singleResult);
  });

  it('does not touch an incremental (defer/stream) response it does not understand', async () => {
    const incremental = {
      kind: 'incremental' as const,
      initialResult: { data: {}, hasNext: true },
      subsequentResults: (async function* () {})(),
    };
    const body = await send(incremental);

    expect(body).toBe(incremental);
  });
});
