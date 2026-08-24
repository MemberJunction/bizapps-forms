# On-submit automations, and who owns respondent identity

What happens after a respondent presses Submit, how to configure it, and — for apps building on
MJ Forms — which record is the authority on who the respondent *is*.

## What runs, and how that is decided

A completed submission runs exactly one of two things:

| The form's published snapshot says | What runs |
|---|---|
| `settings.onSubmitMode = 'Configured'` | the form's own `automations`, **including when that list is empty** (nothing runs) |
| `settings.onSubmitMode = 'Legacy'` | the four built-in hooks |
| nothing (no mode declared) | the four built-in hooks if `automations` is empty, otherwise the form's own |

The third row is the historical behaviour and the default. Every snapshot published before
`onSubmitMode` existed carries no mode, so those forms keep behaving exactly as they always have.

The decision lives in one place — `resolveOnSubmitDispatch` in `@mj-biz-apps/forms-entities` — and
automations always execute **from the published snapshot**, never from the live `FormAutomation`
rows. A step you configure but do not republish does nothing, by design: a response runs the
configuration its own form version was published with.

### The four built-in hooks

In firing order:

1. `Forms: Upsert Respondent Person`
2. `Forms: Send Confirmation Email`
3. `Forms: Create Followup Task`
4. `Forms: Analyze Written Responses`

They predate configurable automations and remain the fallback so that a form nobody has
reconfigured keeps its confirmation email, follow-up task, respondent-Person upsert and answer
scoring. They fire on **complete** submissions only — never on a partial autosave.

## Configuring a form programmatically

Both authoring actions accept two optional input params:

- **`OnSubmitMode`** — `'Legacy'` or `'Configured'`.
- **`Automations`** — the steps to run, in order, each naming an MJ Action. Supplying it implies
  `Configured`. Accepts a JSON string or an already-parsed array.

Array position **is** the run order; there is no `displayOrder` field, so two steps can never
share one.

```jsonc
// Forms: Create Form From Template
{
  "TemplateKey": "application",
  "Automations": [
    { "actionName": "Forms: Send Confirmation Email" },
    { "actionName": "Forms: Create Followup Task" }
  ]
}
```

Per-step options, with their defaults — chosen to reproduce what the legacy runner did:

| field | default | notes |
|---|---|---|
| `trigger` | `OnComplete` | `OnPartial` fires on autosave; think hard before using it for anything a respondent can see |
| `executionMode` | `Sync` | sequential and awaited, so a later step can rely on an earlier one |
| `continueOnError` | `true` | best-effort, matching the legacy loop |
| `isActive` | `true` | an inactive step is carried into the snapshot and skipped at run time |

An Action name this deployment does not have is a **hard failure**, not a skipped step. That is
deliberately the opposite of what the builder's seeding does: seeding skips an unregistered
built-in to reproduce the legacy runner, whereas you explicitly named a step, and silently dropping
it would hand you back a form that does not do what you asked.

### Running nothing at all

```jsonc
{ "TemplateKey": "application", "OnSubmitMode": "Configured" }
```

`Configured` with no `Automations` is the supported way to say *run nothing*. This exists because
an empty automation list used to be indistinguishable from "this form has never configured
anything", so a consumer had no way to decline the built-ins.

## Respondent identity: `Forms: Upsert Respondent Person` owns it

**If your app consumes Forms responses, read `FormResponse.RespondentPersonID` rather than deriving
your own person from the same answers.**

`Forms: Upsert Respondent Person` is the authority on who a respondent is. It matches an existing
`MJ_BizApps_Common: People` row by email (case-insensitive), creates one when there is no match,
and stamps `FormResponse.RespondentPersonID`. It is idempotent twice over: it skips when the
response is already linked, and it reuses a matching Person rather than creating a second.

Its dedupe only covers *its own* rows. A consumer that independently upserts a person from the same
answers produces a second `Person` for the same human — one that Forms does not know about and does
not point at. Nothing errors and nothing is logged; you find out later, when a follow-up task and
the record it is about reference different people.

Two ways to avoid that:

- **Consume `RespondentPersonID`.** The better end-state, and the reason this action is documented
  as the owner. Today it is only fully reachable when your record can *be* the Person or reference
  it — MemberJunction/MJ#3825 tracks the missing piece, IS-A promotion, which is what would let an
  existing Person become the parent of a new child record.
- **Decline the hook**, with `OnSubmitMode: 'Configured'` and whichever steps you do want. Use this
  when your app genuinely owns subject identity and Forms should not mint people at all.

## Configuring a form in the builder

The **Automate** tab writes the same `FormAutomation` rows. Two behaviours are worth knowing:

- Adding your first step **seeds the four built-ins** as ordinary rows first, so the cutover is
  visible and reversible rather than silently switching four things off.
- Adding **or removing** a step marks the form `Configured` **permanently**. Removing every step
  therefore means *run nothing* — the built-ins do not come back. This is the point: before it, an
  author who cleared their steps silently got all four again.

  Marking on removal as well as on addition is what covers a form this builder did not configure in
  the first place. `V202608081400__Backfill_Legacy_Automations` gave every form that predates 0.8.0
  four automation rows and no mode, so an author of one of those can reach an empty list without
  ever having *added* anything — and without this, that empty list would infer `legacy` and bring
  the four built-ins back.

Changes take effect on the next **publish**.
