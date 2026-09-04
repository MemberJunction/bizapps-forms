/**
 * The three device-resume route bodies (#138) — remember, resume, forget.
 *
 * Every dependency is injected, so all of this is testable without an HTTP server, a database or a
 * live magic-link service. That is not only convenience: the two defects the design review found
 * are both ORDERING defects, and an ordering defect is exactly what an integration test discovers
 * last and a pure test discovers first.
 *
 * THE TWO RULES THAT HOLD EVERY PATH HERE:
 *   1. The respondent always gets a form. Nothing in this file returns an error page; a refusal
 *      returns a reason the page turns into one line above an ordinary blank form.
 *   2. A resume failure never harms the draft row. Nothing here writes to a response, ever.
 */
import { LogError, LogStatus } from '@memberjunction/core';

/** Why a resume could not happen. The page maps these to copy; the respondent sees no code. */
export type ResumeRefusal =
  | 'no-pointer'
  | 'disabled'
  | 'door-closed'
  | 'open-elsewhere'
  | 'dead-pointer'
  | 'rate-limited'
  | 'redeem-failed';

/** What a route body decided. The middleware turns this into a response; it decides nothing itself. */
export interface ResumeRouteOutcome {
  status: number;
  /** JSON body, when there is one. Never contains a token. */
  body?: Record<string, unknown>;
  /** A `Set-Cookie` header value to apply, when the pointer changed. */
  setCookie?: string;
  /** Machine-readable reason, echoed to the page so it can pick its one line. */
  reason?: ResumeRefusal;
}

/** The distribution facts these routes judge, read once by the caller. */
export interface ResumeDistribution {
  id: string;
  /** The link's own switch, ANDed with the host-wide one by the caller. */
  allowDeviceResume: boolean;
  /** Why the door is shut, when it is — the same predicates the page route uses. */
  doorRefusal?: string;
  /** The link's closing date, so a minted invite never outlives it. */
  closeAt?: Date | null;
}

/** The stored draft `/remember` is being asked to mint a pointer for. */
export interface ResumeResponseRow {
  id: string;
  status: string;
  anonymousSessionId: string | null;
  /**
   * The link this row was submitted through. `undefined` means "cannot tell", which is a REFUSAL
   * rather than a pass — see `resume-columns.ts` for why it is undefined today.
   */
  formDistributionId?: string;
}

/** Everything the three bodies need from the world. */
export interface DeviceResumeDeps {
  /** The distribution behind the slug, or undefined when there is none. */
  loadDistribution(slug: string): Promise<ResumeDistribution | undefined>;
  /** The stored draft, for the `/remember` ownership checks. */
  loadResponse(responseId: string): Promise<ResumeResponseRow | undefined>;
  /** Redeem a raw token through core, returning the session JWT it mints. */
  redeem(rawToken: string): Promise<{ ok: boolean; token?: string; errorCode?: string }>;
  /** Mint a device invite for a response, returning its raw token and expiry. */
  mint(args: { responseId: string; closeAt?: Date | null }): Promise<{ ok: boolean; rawToken?: string; expiresAt?: Date }>;
  /** Retire invites for a response. `deviceOnly` is a security decision — see the service. */
  revoke(args: { responseId: string; deviceOnly: boolean }): Promise<void>;
  /** What response a raw token opens, without spending it. */
  inviteFor(rawToken: string): Promise<{ ok: boolean; resourceId?: string }>;
  /** The response a session JWT is scoped to, read from the token this redeem just minted. */
  scopeOf(sessionToken: string): string | undefined;
  /** False when this caller has spent their budget for these routes. */
  allowRequest(key: string): boolean;
  /** Cookie writers, closed over the slug and the host's Secure setting by the caller. */
  cookieFor(token: string, maxAgeSeconds: number): string;
  clearCookie(): string;
  /** A caller key for the rate limit — the resolved peer, never anything the caller chose. */
  callerKey: string;
}

/** `POST /f/:slug/resume` — turn a pointer into a session. */
export interface ResumeArgs {
  slug: string;
  /** The pointer this browser holds. */
  cookieToken?: string;
  /** A token the emailed link's interstitial read out of the URL fragment. Wins when both exist. */
  bodyToken?: string;
}

/**
 * Redeem a resume token and hand back the session it mints, rotating the device pointer.
 *
 * GUARD ORDER IS THE POINT, and it is the door's order rather than a new one: a closed or full link
 * is refused BEFORE anything is redeemed, so a respondent who comes back to a form that has since
 * closed still has their draft, and their single-use token is still unspent. Redeeming first would
 * burn it to learn something the row already knew.
 */
export async function runResume(deps: DeviceResumeDeps, args: ResumeArgs): Promise<ResumeRouteOutcome> {
  const rawToken = args.bodyToken || args.cookieToken;
  if (!rawToken) {
    return { status: 410, reason: 'no-pointer' };
  }
  if (!deps.allowRequest(`resume:${deps.callerKey}`)) {
    return { status: 429, reason: 'rate-limited' };
  }
  const distribution = await deps.loadDistribution(args.slug);
  if (!distribution || !distribution.allowDeviceResume) {
    // The owner switched device resume off after this browser was given a pointer. Clear it — the
    // pointer is not going to work again — but redeem NOTHING, so no use is spent proving it.
    return { status: 410, reason: 'disabled', setCookie: deps.clearCookie() };
  }
  if (distribution.doorRefusal) {
    // The door's own predicates, unchanged. No cookie change: the form may reopen, and the draft
    // and its pointer both outlive a temporary closure.
    return { status: 410, reason: 'door-closed' };
  }

  const redeemed = await deps.redeem(rawToken);
  if (!redeemed.ok || !redeemed.token) {
    return refusedRedeem(deps, redeemed.errorCode);
  }

  const responseId = deps.scopeOf(redeemed.token);
  if (!responseId) {
    // A session that redeemed but names no response is not a resume session. Nothing to rotate.
    LogError('[Forms] a resume redeem produced a session with no response scope; not rotating the pointer.');
    return { status: 200, body: { token: redeemed.token } };
  }

  // ROTATION. The token just spent is single-use and now Consumed, so the browser needs the next
  // one — and the emailed path lands here too, which is what earns a device its pointer the first
  // time a respondent opens the link on it.
  const minted = await deps.mint({ responseId, closeAt: distribution.closeAt });
  if (!minted.ok || !minted.rawToken || !minted.expiresAt) {
    // The resume itself SUCCEEDED. Hand back the session — the respondent gets their answers — and
    // clear the spent pointer rather than leaving a token that will 410 on the next load.
    LogStatus(`[Forms] resumed response ${responseId} but could not mint its next pointer; device resume ends here.`);
    return { status: 200, body: { token: redeemed.token }, setCookie: deps.clearCookie() };
  }
  return {
    status: 200,
    body: { token: redeemed.token },
    setCookie: deps.cookieFor(minted.rawToken, secondsUntil(minted.expiresAt)),
  };
}

/**
 * What a refused redeem does about the pointer — and the ONE case where it must do nothing.
 *
 * `consumed` means another tab won the race a moment ago. THAT TAB HAS ALREADY ROTATED THIS JAR'S
 * COOKIE: there is one cookie jar per browser profile, so clearing here discards the winner's fresh
 * pointer. The loser then starts a SECOND draft, the next reopen resumes that one, and the real
 * draft is orphaned — reachable only by an emailed link the respondent may never have asked for.
 *
 * A double open is the COMMON case for this refusal, not the exotic one: two tabs, a restored
 * session, a mobile browser reviving a backgrounded page. So it gets its own reason and its own
 * copy, while genuine theft still shows up exactly as the design intends — as a failure the owner
 * sees at their next reopen.
 */
function refusedRedeem(deps: DeviceResumeDeps, errorCode: string | undefined): ResumeRouteOutcome {
  if (errorCode === 'consumed') {
    return { status: 410, reason: 'open-elsewhere' };
  }
  return { status: 410, reason: 'dead-pointer', setCookie: deps.clearCookie() };
}

/** `POST /f/:slug/remember` — mint the first pointer, after proving the draft is the caller's. */
export interface RememberArgs {
  slug: string;
  responseId: string;
  /** The caller's `x-session-id`. The ONLY ownership proof a first sitting has. */
  sessionId: string;
  /** The distribution the caller's JWT is scoped to. */
  scopeId: string;
  /** The pointer this browser already holds, if any. */
  cookieToken?: string;
}

/**
 * Give this browser a pointer to a draft it just created.
 *
 * FOUR THINGS ARE PROVEN BEFORE ANYTHING IS MINTED, and the first is the one the design review
 * caught missing: without the caller's session id there is no evidence at all that the draft is
 * theirs, and minting on a bare response id would hand a bearer token to anyone who could name one
 * — precisely the header-replay weakness this feature exists to close.
 */
export async function runRemember(deps: DeviceResumeDeps, args: RememberArgs): Promise<ResumeRouteOutcome> {
  if (!args.responseId || !args.sessionId.trim()) {
    return { status: 400, reason: 'no-pointer' };
  }
  if (!deps.allowRequest(`remember:${deps.callerKey}`)) {
    return { status: 429, reason: 'rate-limited' };
  }
  const distribution = await deps.loadDistribution(args.slug);
  if (!distribution || !distribution.allowDeviceResume) {
    // Not an error to the respondent: their answers are saved, and this browser simply gets no
    // pointer. 204 with no cookie is exactly "nothing happened".
    return { status: 204 };
  }

  const response = await deps.loadResponse(args.responseId);
  if (!response || response.status !== 'Partial') {
    // Only a live draft is worth a pointer. A sealed row would hand out a credential to answers
    // that can no longer change.
    return { status: 409 };
  }
  if (!ownsDraft(response, args)) {
    LogError(`[Forms] refused to remember response ${args.responseId}: the caller does not own it.`);
    return { status: 403 };
  }

  const replacing = await pointerConflict(deps, args);
  if (replacing) {
    // THE SECOND HALF OF THE TWO-TAB FIX. The loser tab's first autosave arrives holding the
    // winner's rotated pointer; overwriting it would point this jar at the loser's new draft and
    // abandon the real one. Refuse, and leave the cookie exactly as it is.
    LogStatus(`[Forms] not replacing a live pointer to response ${replacing} with one to ${args.responseId}.`);
    return { status: 409 };
  }

  const minted = await deps.mint({ responseId: args.responseId, closeAt: distribution.closeAt });
  if (!minted.ok || !minted.rawToken || !minted.expiresAt) {
    // The save already succeeded; this is the only thing that did not. Logged with the response id,
    // never with a token.
    LogError(`[Forms] could not mint a device pointer for response ${args.responseId}.`);
    return { status: 204 };
  }
  return { status: 204, setCookie: deps.cookieFor(minted.rawToken, secondsUntil(minted.expiresAt)) };
}

/**
 * Whether the caller may be given a pointer to this row.
 *
 * Two independent facts, both required. The session id is the caller's own claim on the row — the
 * same rule `responseIsOurs` applies at the write, restated here because this route writes no
 * response and therefore never reaches that gate. The distribution match is the review's addition:
 * a JWT scoped to link A must not be able to mint a pointer to a draft submitted through link B,
 * even one the caller genuinely owns, because the pointer it mints would resume into a form the
 * caller's session was never admitted to.
 *
 * An UNKNOWN distribution on the row is a refusal, never a pass.
 */
function ownsDraft(response: ResumeResponseRow, args: RememberArgs): boolean {
  const owner = (response.anonymousSessionId ?? '').trim().toLowerCase();
  const caller = args.sessionId.trim().toLowerCase();
  if (owner !== '' && owner !== caller) {
    return false;
  }
  const rowLink = (response.formDistributionId ?? '').trim().toLowerCase();
  return rowLink !== '' && rowLink === args.scopeId.trim().toLowerCase();
}

/**
 * The response a live pointer already names, when replacing it would abandon a draft.
 *
 * Returns the OTHER response's id, or undefined when there is nothing to protect: no cookie, an
 * unreadable one, or one that names this very draft (the ordinary re-mint).
 */
async function pointerConflict(deps: DeviceResumeDeps, args: RememberArgs): Promise<string | undefined> {
  if (!args.cookieToken) {
    return undefined;
  }
  const invite = await deps.inviteFor(args.cookieToken);
  if (!invite.ok || !invite.resourceId) {
    return undefined;
  }
  const held = invite.resourceId.trim().toLowerCase();
  if (held === args.responseId.trim().toLowerCase()) {
    return undefined;
  }
  const other = await deps.loadResponse(invite.resourceId);
  // Only a still-live draft is worth protecting. A sealed or vanished one is not something the
  // respondent can come back to, so the new pointer is strictly better.
  return other && other.status === 'Partial' ? invite.resourceId : undefined;
}

/** `POST /f/:slug/forget` — drop the pointer, and only the pointers this device holds. */
export interface ForgetArgs {
  slug: string;
  cookieToken?: string;
}

/**
 * Forget this device's pointer.
 *
 * ALWAYS clears the cookie, whatever else fails: the respondent asked to be forgotten, and a
 * failure to revoke server-side must not leave the browser still holding a live pointer.
 *
 * Revokes DEVICE invites only. The person pressing "Not you? Start over" is, by definition, not the
 * owner — that is the entire situation the control exists for — so killing the owner's emailed link
 * from here would let a stranger on a shared device lock them out of their own draft.
 */
export async function runForget(deps: DeviceResumeDeps, args: ForgetArgs): Promise<ResumeRouteOutcome> {
  const cleared = { status: 204, setCookie: deps.clearCookie() };
  if (!args.cookieToken) {
    return cleared;
  }
  const invite = await deps.inviteFor(args.cookieToken);
  if (!invite.ok || !invite.resourceId) {
    return cleared;
  }
  await deps.revoke({ responseId: invite.resourceId, deviceOnly: true });
  return cleared;
}

/** Remaining life of an invite, in whole seconds, floored at zero. */
function secondsUntil(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}
