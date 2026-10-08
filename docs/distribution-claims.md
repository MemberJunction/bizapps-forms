# Distribution claims: telling Forms a share link is yours

For authors of Open Apps installed alongside MJ Forms that use a Forms distribution slug as their
own intake (a hiring app that hosts a form on an interview step, for example).

The problem: the plain Forms link `/f/<slug>` still works. If someone shares it, submissions on it
become ordinary form responses and your app never sees them. A **claim provider** lets your app
say "I own this slug", so the builder's Distribute tab warns the author before they share the
wrong link.

Forms and your app import nothing from each other. The protocol is a versioned slot in MJ's global
object store, so there is no dependency, no peer range and no release coupling.

## Registering a provider

Run this once at server start-up, in your app's server package. It needs no Forms import:

```ts
import type { UserInfo } from '@memberjunction/core';

type Claim = { slug: string; ownerLabel: string; respondentUrl: string | null };
type ClaimProvider = {
  AppName: string;
  FindClaims(slugs: readonly string[], contextUser: UserInfo): Promise<Claim[]>;
};

const KEY = '__mjBizAppsForms.distributionClaimProviders.v1';
const provider: ClaimProvider = {
  AppName: 'Caliber',
  async FindClaims(slugs, contextUser) {
    return []; // a Claim for each asked slug you own
  },
};

const slot = ((globalThis as Record<string, unknown>)[KEY] ??= []) as ClaimProvider[];
slot.push(provider);
```

The slot is an array. If it is somehow not one, Forms reports that to the author as a failure.

- **Create if absent, then push. Never replace.** The slot is shared by every consumer; assigning a
  new array silently evicts the others.
- Forms reads the slot **lazily, on each query**, so it does not matter whether your package or
  Forms loads first.
- `GetGlobalObjectStore()` from `@memberjunction/global` is `globalThis` in Node (it returns
  `window` only in a browser), so either spelling reaches the same slot.
- The `.v1` suffix is the contract version. An incompatible change would use a new key and leave
  `.v1` consumers working.

## The provider

| Member | Rule |
|---|---|
| `AppName` | The name the author will recognise. Trimmed; non-blank, at most 200 characters. |
| `FindClaims(slugs, contextUser)` | Returns `{ slug, ownerLabel, respondentUrl }[]`: one entry per asked slug you own, nothing for the rest. |

`FindClaims` is a **read**. Do not write, create or send anything from it. `contextUser` is the
author viewing the builder; you decide what that user may learn. The `slugs` array is frozen.

A provider with a missing, blank or over-200-character `AppName`, or without a `FindClaims`
function, is rejected and reported to the author.

Forms validates every answer, so a provider can lose only its own claims. It drops a claim for an
unasked slug or with a bad `ownerLabel`, and keeps a claim whose `respondentUrl` is bad but nulls
the URL; each case is reported:

- `slug` must be one of the slugs asked about. Anything else is rejected.
- `ownerLabel` says what inside your app owns the slug (an interview step's name). Trimmed;
  non-blank, at most 200 characters.
- `respondentUrl` is your own public link for the slug: `null`, or an absolute `http(s)` URL.
  Anything else (a relative path, `javascript:`) is nulled and reported as a failure.
  **Return `null` when your front door must not be published**; the author is then told to use the
  link your app hands out.
- A thrown error or rejected promise shows the author `did not answer (details in the server log)`;
  the full error goes to the server log, never to the browser. No answer within **5 seconds**
  shows `did not answer within 5000ms`.

## What the author sees

On the **Distribute** tab, for each share link your app claims:

- a warning naming your app and the `ownerLabel`: responses sent to the Forms link are saved as form
  responses only, and your app never sees them;
- your `respondentUrl` in a read-only field with a copy button ("Send people to your app's link
  instead"), or, when it is `null`, "Share the link your app gives you instead";
- ` · used by <your app's name>` in the left rail, next to the link's response count, and a note
  that the link stores responses only.

If a provider fails, the tab shows a line saying it could not check whether that app uses these
links. A failed check is never shown as "nobody claims this".

Only users with Update rights on Form Distributions can ask; the query is the authenticated
GraphQL `FormDistributionClaims(formId)`.

## Things to know

- **The registry is per process.** Every MJAPI process that serves the Forms builder must load your
  server package. Forms cannot tell "no claims" from "your app is not loaded in this process", and
  shows no warning in the second case.
- **Forms does not enforce anything.** It does not change `/f/<slug>` for respondents and does not
  route submissions to your app. The warning is advice to the author; your own front door is what
  actually delivers submissions to you.
