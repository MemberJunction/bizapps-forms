# Upload storage-failure leak (#142) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When file storage fails during an anonymous upload, the respondent reads one authored sentence and the operator reads the provider's detail in the server log, with the respondent's file name taken out of it.

**Architecture:** `storeFile`'s catch in `packages/Server/src/upload/upload.service.ts` stops interpolating `error.message` into the HTTP body. It logs the detail via `LogError` with the response, question and distribution ids, after passing it through the existing `redactStorageKey` (#290), and returns an exported constant `UPLOAD_FAILED_MESSAGE`. The `respondent-errors-path.mjs` smoke gains two probes of `POST /forms/upload`.

**Tech Stack:** TypeScript, Vitest, `@memberjunction/core` `LogError`, plain-Node smoke scripts.

**Spec:** https://github.com/MemberJunction/bizapps-forms/issues/142

## Root cause

`storeFile` (`upload.service.ts:445-450` on `next` @ 54455bc) catches anything thrown by `storage.Config`, `storage.UploadFile` or the provenance writer and returns
`fail(500, \`File storage is not available: ${detail}\`)`. The middleware sends `failure.error` as the JSON body (`UploadMiddleware.ts:165-166`), and the widget renders a body's `error` string verbatim (`packages/Angular/src/lib/widget/api/form-upload.service.ts:62-66` via `serverErrorText`). The route is gated only by `checkRespondentScope` (`upload.service.ts:154`), so the anonymous session a public link mints can reach it.

The detail is worse than the issue states. MJ's own `FileStorageEngine.UploadFile` (`@memberjunction/storage@6.1.5`, `dist/FileStorageEngine.js`) throws
`PutObject returned false for path '<prefix>/<fileName>'` and `failed to save MJ: Files record for '<fileName>'`. So the leak includes the uploaded file's name, and moving the text into the log unchanged would put that personal data in the log. #290 set the rule that respondent file names stay out of logs (`storage/read-object.ts:229-257`, `redactStorageKey`).

**Repro (captured):** six new tests in `upload.service.spec.ts` fail on `next`. The received body was
`File storage is not available: FileStorageEngine.UploadFile: PutObject returned false for path 'forms-uploads/<date>/<uuid>/Jane Doe passport.png'`.

## Global Constraints

- Authored sentence, exactly: `Your file could not be uploaded. Please try again.`
- Only the 5xx storage branch changes. Every 4xx message keeps its current text.
- `LogError`, not `LogStatus` (MJ silences `LogStatus` under `NODE_ENV=production`).
- No `any`, no new dependencies, no re-exports, no dynamic imports.
- Changeset: `patch` for `@mj-biz-apps/forms-server` (no migration, no metadata).
- Never hand-edit `generated/`.

## Review Focus

1. A provider that throws a non-`Error` value (a string, an object): the body must still be the authored sentence. Test: Task 1, "does not echo a thrown non-Error value either".
2. `storage.Config` throwing before `UploadFile` runs (no account configured, credential missing): same body. Test: Task 1, the `it.each` row "configuring the engine throws".
3. A file name with a leading dot (`.resume.pdf`): MJ strips leading dots before building the key, so the log would quote `resume.pdf`. Redacting the dot-stripped name covers both spellings, because it is a substring of each. Test: Task 1, "keeps a dot-prefixed file name out of the logged detail".
4. An upload without a `responseId` (older widget): the log line must still be written and say `(none)`, not `undefined`. Test: Task 1, "logs (none) when the widget sent no response id".
5. A smoke run against a host whose storage works: the upload probe must not fail. It accepts a 200 and scans it; only a 5xx must equal the authored sentence. Covered by Task 2's probe logic and run during the smoke step.

## Files

- Modify: `packages/Server/src/upload/upload.service.ts` (catch in `storeFile`, new exported constant, one private log helper, hoist `safeFileName`/`uploadPathPrefix` results into locals so the redaction key is the one the engine received)
- Modify: `packages/Server/src/upload/__tests__/upload.service.spec.ts` (new describe block; the old `/storage/i` assertion is replaced, see Deviations)
- Modify: `smoke/respondent-errors-path.mjs` (upload probes, storage fingerprints, header)
- Modify: `smoke/resume-arc-path.mjs:205-210` (comment only: it says the storage message "was already on screen"; it is now in the server log)
- Create: `.changeset/upload-storage-error-is-authored.md`

## Non-goals

- `packages/Server/src/asset/asset.service.ts:291` has the same interpolation, but `POST /forms/asset` is the authenticated authoring route (staff, not anonymous). Out of scope for #142; noted in the PR as a known gap.
- The widget's fallback text, the provenance-failure sentence (`Upload could not be recorded; please try again.`), and the middleware's outer catch (`Upload failed unexpectedly…`) are already authored and unchanged.
- No change to the rate limiter, embed-origin gate or any 4xx text.

## Deviations from the issue's definition of done

- "No changed expectation in an existing test": one existing assertion, `expect(result.failure?.error).toMatch(/storage/i)` in "returns a clean 5xx (not a crash) when storage is unconfigured", pinned the leaking prefix `File storage is not available:`. The issue's mandated sentence contains no "storage", so that assertion cannot survive. It becomes `toBe(UPLOAD_FAILED_MESSAGE)`, which is strictly stronger. No other existing expectation changes.

## Plan review (council, 2026-10-06)

Sent: this plan, `upload.service.ts`, `UploadMiddleware.ts`, `storage/read-object.ts`, `upload.service.spec.ts`, `smoke/respondent-errors-path.mjs`. Answered: gpt-5.5, gemini-3.1-pro-preview (grok-4.7 timed out at 600s). Each finding was checked against the code before it was accepted.

**Accepted (plan amended below):**

1. *The `try` also wraps the provenance writer* (gpt-5.5). Confirmed: `upload.service.ts:401-450`, where the `record(...)` call at `:413-427` sits inside the `try` whose catch is about storage. A throwing writer would be logged as a storage failure. The default writer never throws (`:268-303` returns false), so only an injected writer can. **Change:** the `try` covers `Config` + `UploadFile` only. A writer that throws breaks its documented contract (`:262-267`) and propagates to the middleware's outer catch (`UploadMiddleware.ts:90-93`), which logs it and sends its own authored sentence. New test pins that.
2. *`String(error)` loses a thrown object's detail* (gpt-5.5). Confirmed: `String({code:'X'})` is `[object Object]`, so the log would say nothing. **Change:** non-`Error` values are described with `node:util` `inspect` (never throws, handles cycles). New test pins that the log keeps an object's fields.
3. *The dot-prefixed test only quotes the stripped spelling* (gemini). Confirmed: MJ's `failed to save MJ: Files record for '${fileName}'` quotes the ORIGINAL name (`FileStorageEngine.js`, after `fileEntity.Save()`), while `PutObject returned false for path` quotes the cleaned one. **Change:** the test throws a message quoting both spellings.
4. *The smoke false-fails on other authored 5xx* (gemini). Confirmed: `503` "The upload service is busy right now…" (`UploadMiddleware.ts:118`), `500` "Upload could not be recorded; please try again." (`upload.service.ts:432`), `500` "Upload failed unexpectedly…" (`UploadMiddleware.ts:92`). **Change:** every 5xx body is leak-scanned; the storage sentence passes as "storage-failure path exercised"; another known authored sentence is a `warn` (path not exercised); anything else fails.
5. *A healthy host never exercises the 5xx path, so the smoke can pass while proving nothing about it* (gpt-5.5). Confirmed by design. **Change:** on a 200 the smoke prints a `skip` line saying the storage-failure path was not exercised, with the recipe (`FORMS_UPLOAD_STORAGE_ACCOUNT` set to an id that names no account, on a private harness).
6. *"Use them in the provenance input" is ambiguous* (gemini). The claimed data-loss regression is not what the plan does (`providerKey` stays `result.StoragePath`, `upload.service.ts:417`), but the wording could mislead an implementer. **Change:** Task 1 says exactly which fields use the locals.

**Rejected:**

- *A dot-only name (`...`) is not redacted* (gpt-5.5). True that `safeFileName('...')` returns `...` (`upload.service.ts:459-467`) and MJ stores it as `file`, so the stripped basename is empty and nothing is redacted for it. Rejected because neither `...` nor `file` carries personal data, which is the only thing the redaction exists to remove (`read-object.ts:233-235`).
- *Add an HTTP/middleware-level unit test* (gpt-5.5). The middleware maps `failure.error` to the body unchanged (`UploadMiddleware.ts:164-166`) and has no unit harness: `uploadContextFor` builds real MJ providers and `FileStorageEngine.Instance`. Standing one up is disproportionate to a mapping this change does not touch. The HTTP-level proof is the live smoke on a private harness (step 7), run before and after the fix.
- *The log keeps the leading dot of a dot-prefixed name* (gemini). Agreed and harmless: gemini itself notes a dot is not personal data.

---

### Task 1: Authored sentence + redacted operator log in `storeFile`

**Files:**
- Modify: `packages/Server/src/upload/upload.service.ts:384-451`
- Test: `packages/Server/src/upload/__tests__/upload.service.spec.ts`

**Interfaces:**
- Produces: `export const UPLOAD_FAILED_MESSAGE = 'Your file could not be uploaded. Please try again.';` from `upload.service.ts`.
- Consumes: `redactStorageKey(text: string, providerKey: string): string` from `packages/Server/src/storage/read-object.ts` (import as `'../storage/read-object'`, matching this file's extensionless relative imports).

- [ ] **Step 1: Failing tests (already written as the repro).** The describe block `runUpload — a storage failure tells the respondent nothing about the host (#142)` exists. Add these two Review Focus tests inside it:

```ts
  it('keeps a dot-prefixed file name out of the logged detail, in either spelling MJ quotes', async () => {
    // MJ strips leading dots before it builds the key, so `PutObject` quotes the stripped name, while
    // its `MJ: Files` save failure quotes the name exactly as it was passed. Both in one message.
    const file: ParsedFile = { ...pngFile(), filename: '.Jane-Doe-resume.png' };
    const upload = vi.fn(async (options: { fileName: string; pathPrefix?: string }) => {
      const cleaned = options.fileName.replace(/^\.+/, '');
      throw new Error(
        `PutObject returned false for path '${options.pathPrefix}/${cleaned}'; `
          + `failed to save MJ: Files record for '${options.fileName}'`,
      );
    });
    const storage = storageEngine({ UploadFile: upload as unknown as UploadStorageEngine['UploadFile'] }).engine;

    await runUpload(context({ storage }), request({ file }));

    const line = logged.find((l) => l.includes('PutObject returned false'));
    expect(line).toBeDefined();
    expect(line).not.toContain('Jane-Doe');
  });

  it('logs (none) when the widget sent no response id', async () => {
    await runUpload(context({ storage: failingStorage('UploadFile', new Error(PROVIDER_DETAIL)) }), request());

    const line = logged.find((l) => l.includes(PROVIDER_DETAIL));
    expect(line).toContain('response (none)');
    expect(line).not.toContain('undefined');
  });

  it('keeps the fields of a thrown non-Error object in the log', async () => {
    await runUpload(
      context({ storage: failingStorage('UploadFile', { code: 'AccountNotFound', detail: 'acme-prod' }) }),
      request(),
    );

    const line = logged.find((l) => l.includes('[Forms] upload storage failed'));
    expect(line).toContain('AccountNotFound');
    expect(line).toContain('acme-prod');
  });

  it('does not report a provenance writer that throws as a storage failure', async () => {
    // The writer's contract is to return false (see writeProvenanceRow). One that throws instead
    // propagates to the middleware's outer catch, which logs it and answers with its own sentence.
    const ctx = { ...context({}), recordProvenance: async (): Promise<boolean> => { throw new Error('ledger exploded'); } };

    await expect(runUpload(ctx, request())).rejects.toThrow('ledger exploded');
    expect(logged.some((l) => l.includes('upload storage failed'))).toBe(false);
  });
```

Replace the old assertion in "returns a clean 5xx (not a crash) when storage is unconfigured":

```ts
    expect(result.failure?.error).toBe(UPLOAD_FAILED_MESSAGE);
```

- [ ] **Step 2: Run, expect red.** `cd packages/Server && npx vitest run src/upload/__tests__/upload.service.spec.ts` → the #142 block fails: all 10 of its tests, including the provenance-throws test, which fails because the old catch swallows the throw. And the edited old test fails too.

- [ ] **Step 3: Implement.** In `upload.service.ts`:

Add after the `fail` helper:

```ts
/**
 * The one sentence a respondent reads when their file could not be stored (#142). Authored here,
 * never derived from the failure: the route is reachable with the session a public form link mints,
 * the widget shows a body's `error` verbatim, and what storage throws is OPERATOR text — an account,
 * an endpoint, a bucket, a credential error, and from MJ's own `UploadFile` the object path ending in
 * the respondent's file name. That text goes to the log, with the file name redacted, instead.
 */
export const UPLOAD_FAILED_MESSAGE = 'Your file could not be uploaded. Please try again.';
```

In `storeFile`, compute `const fileName = safeFileName(file.filename);` and `const pathPrefix = uploadPathPrefix(cfg.pathPrefix);` before the `try`. `fileName` replaces the three `safeFileName(file.filename)` calls (`UploadFile`'s `fileName`, the provenance input's `fileName`, the success body's `name`); `pathPrefix` replaces the inline `uploadPathPrefix(...)` in the `UploadFile` call only. The provenance `providerKey` stays `result.StoragePath`. Then **narrow the `try` to the two storage calls** (review finding 1) and move the provenance write and success body after it:

```ts
  let stored: { FileID: string; StoragePath?: string };
  try {
    await ctx.storage.Config(false, writer);
    stored = await ctx.storage.UploadFile({ /* unchanged options, using fileName and pathPrefix */ });
  } catch (error) {
    // No storage account configured / provider misconfigured / upload failed: a 5xx, never a crash.
    // The respondent gets the authored sentence; the provider's own words go to the log (#142).
    logStorageFailure(error, {
      responseId: req.responseId,
      questionId,
      distributionId: resolved?.distributionId,
      storageKey: `${pathPrefix}/${fileName}`,
    });
    return fail(500, UPLOAD_FAILED_MESSAGE);
  }
  // provenance block and success body follow, unchanged apart from `stored` and `fileName`
```

The helper describes a non-`Error` with `inspect` from `node:util` (review finding 2): replace the `detail` line with
`const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : inspect(error, { depth: 3, breakLength: Infinity });`.

Add the helper below `storeFile`:

```ts
/**
 * Where an operator reads why storage failed, tied to the response and question it was for.
 *
 * `LogError`, not `LogStatus`: MJ silences `LogStatus` under NODE_ENV=production. The detail is run
 * through {@link redactStorageKey} because MJ's `UploadFile` quotes the object path, which ends in the
 * respondent's file name (personal data, kept out of logs since #290). MJ strips leading dots from
 * that name before building the path, so the key is redacted in its dot-stripped spelling, which is
 * a substring of both spellings and so covers whichever one the error quotes.
 */
function logStorageFailure(
  error: unknown,
  at: { responseId?: string; questionId?: string; distributionId?: string; storageKey: string },
): void {
  const detail = error instanceof Error ? error.message : String(error);
  const slash = at.storageKey.lastIndexOf('/');
  const key = at.storageKey.slice(0, slash + 1) + at.storageKey.slice(slash + 1).replace(/^\.+/, '');
  LogError(
    `[Forms] upload storage failed for response ${at.responseId ?? '(none)'}, question ${at.questionId ?? '(none)'}, `
      + `distribution ${at.distributionId ?? '(unresolved)'}: ${redactStorageKey(detail, key)}`,
  );
}
```

- [ ] **Step 4: Run, expect green.** Same command → all tests pass (25 existing + 14 new, counting those added after review; see Amendments). Then `cd packages/Server && npx vitest run` (whole package) and `pnpm run typecheck` in `packages/Server`.

- [ ] **Step 5: Commit.** `fix(forms-server): tell a respondent one sentence when their upload cannot be stored (#142)`, with the changeset:

```md
---
"@mj-biz-apps/forms-server": patch
---

The public upload endpoint no longer returns the storage provider's error text to the respondent (#142). When storing a file fails, the response is `Your file could not be uploaded. Please try again.`; the provider's message goes to the server log with the response, question and distribution ids, and with the uploaded file's name redacted. Size, type and other 4xx messages are unchanged.
```

**Amendments after review (Task 1).** The helper snippet and Review Focus 3 above describe a dots-only strip. Commit 510a19b changed it to strip leading dots THEN trim, mirroring MJ's `cleanFileName` (a name like `. Jane Doe.png` is quoted trimmed), and added a test for it. The final-review fix wave then: reworded the `writeProvenanceRow` comment (a throw escapes to the middleware's generic catch, not a storage error), typed `stored` from `UploadStorageEngine['UploadFile']`, and briefly logged `responseId` only when GUID-shaped (else `(invalid)`); the step-8 diff council replaced that with a boundary guard in `runUpload`: a `responseId` that is not exactly GUID-shaped (no trim) is refused 400 before the distribution resolves or anything is stored, because a non-GUID otherwise fails the provenance insert after the bytes are stored and the SQL layer echoes the whole batch, file name included, into the log. `loggableResponseId` was removed; tests: refused non-GUID (storage not called), upper-case accepted, whitespace refused. Fixtures `resp-142`/`resp-42` became real GUIDs.

### Task 2: `smoke:errors` probes the upload route

**Files:**
- Modify: `smoke/respondent-errors-path.mjs`
- Modify: `smoke/resume-arc-path.mjs:205-210` (comment)

**Interfaces:**
- Consumes: the literal `Your file could not be uploaded. Please try again.` (a `.mjs` smoke cannot import the TS constant; the Task 1 test `exports the authored sentence…` pins the two together, the same arrangement `SAVE_FAILED` uses).

- [ ] **Step 1: Storage fingerprints.** Append to `LEAK_FINGERPRINTS`:

```js
  [/File storage is not available|FileStorageEngine|PutObject|\bE(?:NOTDIR|NOENT|ACCES)\b|\.blob\.core\.windows\.net|amazonaws\.com|storage\.googleapis\.com/i,
    'storage provider vocabulary'],
```

- [ ] **Step 2: Upload helper + probe.** Add `postUpload(token, questionId)` that POSTs multipart (`file` = 5-byte PDF `smoke-errors.pdf`, `distributionSlug`, `questionId`, `responseId`) to `${BASE}/forms/upload` with `Authorization` and `x-session-id`, returning `{ status, text }`. Add `uploadProbe(token, label, questionId, extra)` that scans `text` with `leaksIn` exactly like `probe`.

- [ ] **Step 3: Two probes at the end of `main()`, before the summary:**
  1. Unknown question (`randomUUID()`): expect HTTP 400, scan the body. Refused before storage, so it writes nothing.
  2. If the definition has a question of type `FileUpload` or `Doodle`: upload against it. Every body is leak-scanned. Then (review findings 4 and 5):
     - **200**: pass the scan, and print a `skip` line saying the storage-failure path was not exercised, with the recipe (a private harness started with `FORMS_UPLOAD_STORAGE_ACCOUNT` set to an id that names no account). Say that a healthy run wrote one `MJ: Files` row and one ledger row.
     - **5xx with `error` exactly the storage sentence**: pass, "storage-failure path exercised".
     - **5xx with another known authored sentence** (`The upload service is busy right now. Please try again in a moment.`, `Upload could not be recorded; please try again.`, `Upload failed unexpectedly. Please try again later.`): `warn`, path not exercised.
     - **anything else**: fail, printing the body.
     With no file question, `skip` with the reason.

- [ ] **Step 4: Header.** Add a paragraph (c) describing the upload route leak and that the 5xx is only reachable with broken storage, so a healthy run proves the 400 path and the scan, and a run against a host with a broken storage account proves the 5xx path.

- [ ] **Step 5: Comment fix** in `resume-arc-path.mjs`: the storage message is now in the server log, not on screen.

- [ ] **Step 6: Verify** `node --check smoke/respondent-errors-path.mjs`, then run it in the smoke step against the branch harness. Commit: `test(smoke): probe the upload route in smoke:errors (#142)`.
