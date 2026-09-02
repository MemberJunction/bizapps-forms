/**
 * Keeps `extensions.stacktrace` out of every GraphQL error response this host sends.
 *
 * Apollo attaches the stack — absolute server paths and pinned dependency versions — to every
 * formatted error unless `NODE_ENV` is `production` or `test`, and MJ's `buildApolloServer` never
 * sets `includeStacktraceInErrorResponses`, so that default is the whole policy. On a host that
 * serves `/f/:slug`, the caller who receives it needs no credentials of their own: the public form
 * link mints them an anonymous session, and one malformed query returns thirteen frames of
 * filesystem layout and version numbers (issue #119). A production host is clean only for as long
 * as its `NODE_ENV` stays exactly right; this makes it clean regardless.
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsStacktraceRedaction')` so MJ server
 * bootstrap discovers it and merges the plugin through `GetApolloPlugins()` — the seam MJ documents
 * for "custom error formatting". No core fork, no config knob, no per-request decision.
 *
 * UNCONDITIONAL, deliberately. Scoping the strip to anonymous sessions was considered and
 * rejected: it would key a security control on the request context's shape (a cast from Apollo's
 * `BaseContext`, then an `any`-typed `userRecord`) and fail OPEN if that shape ever drifted. A
 * developer who needs the stack of a thrown resolver error has the server log, where the resolver
 * that threw is expected to have written it; the wire is not a log.
 *
 * WHAT IT CANNOT REACH. `willSendResponse` runs after `formatErrors` for parse, validation and
 * execution errors — the cases that carry resolver and graphql-js frames. Three responses are built
 * before the request pipeline exists, so no plugin, this one included, is ever invoked for them:
 *
 *   1. A malformed HTTP request — an unparseable JSON body, a body with no operation, a
 *      CSRF-prevention refusal. Apollo answers from `executeHTTPGraphQLRequest`, or Express's
 *      `body-parser` throws before Apollo sees it at all.
 *   2. A CONTEXT-CREATION failure. `ApolloServer.errorResponse` formats it with
 *      `includeStacktraceInErrorResponses` and returns directly, invoking no plugin. This one is
 *      NOT merely "Apollo's own frames": MJ's context function opens per-request providers, so a
 *      pool exhaustion or an unreachable database surfaces as
 *      `Context creation failed: <driver message>` plus a stack — the driver's words and MJ's
 *      paths, which is the leak class #119 is about, arriving by a door no plugin guards.
 *
 * All three are clean when `NODE_ENV` is `production`, because Apollo then omits the stack itself.
 * So `NODE_ENV=production` remains the correct production setting, and it is the ONLY thing
 * covering these three; only `includeStacktraceInErrorResponses` on MJ core's `buildApolloServer`
 * would make them safe regardless.
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';

/**
 * The plugin type MJ's seam accepts, derived from the seam itself so this package needs no direct
 * `@apollo/server` dependency — it tracks whatever Apollo major `@memberjunction/server` builds on.
 */
type MJApolloPlugin = ReturnType<BaseServerMiddleware['GetApolloPlugins']>[number];
type GraphQLRequestContext = Parameters<NonNullable<MJApolloPlugin['requestDidStart']>>[0];
type FormattedError = NonNullable<
  Extract<GraphQLRequestContext['response']['body'], { kind: 'single' }>['singleResult']['errors']
>[number];

/** The same error without `extensions.stacktrace`; the identical object when there was none. */
function withoutStacktrace(error: FormattedError): FormattedError {
  if (!error.extensions || !('stacktrace' in error.extensions)) {
    return error;
  }
  const extensions = { ...error.extensions };
  delete extensions.stacktrace;
  return { ...error, extensions };
}

/**
 * Rewrite the errors of a single-result response in place. An incremental (defer/stream) body is
 * left alone: MJ does not serve them, and rewriting a shape this code has not seen is how a guard
 * turns into a crash.
 */
function redactStacktraces(requestContext: GraphQLRequestContext): void {
  const body = requestContext.response.body;
  if (body.kind !== 'single' || !body.singleResult.errors) {
    return;
  }
  body.singleResult.errors = body.singleResult.errors.map(withoutStacktrace);
}

@RegisterClass(BaseServerMiddleware, 'mj:formsStacktraceRedaction')
export class StacktraceRedactionMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsStacktraceRedaction';
  }

  public override GetApolloPlugins(): MJApolloPlugin[] {
    return [
      {
        async requestDidStart() {
          return {
            async willSendResponse(requestContext) {
              redactStacktraces(requestContext);
            },
          };
        },
      },
    ];
  }
}
