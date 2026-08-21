# Form element parity + separated Welcome/Ending screens

Closes the gap between the MJ Forms element palette (15 question types) and the reference
palette, and — the load-bearing half — pulls Welcome and Ending screens **out of the intake
flow** into their own abstraction.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Shared capability table + contract types | ✅ |
| 2 | Migration + CodeGen (25 types, `FormScreen`, option images, partial-submit flag) | ✅ |
| 3 | Widget: render the 10 new types | ✅ |
| 4 | Widget: Welcome / Ending screen phases | ✅ |
| 5 | Server: parse, validate, persist, select ending | ✅ |
| 6 | Builder: palette, per-type editors, Screens editor | ✅ |
| 7 | Reporting / responses / export / AI authoring | ✅ |

## Found on the way

Two defects that predate this change and were inside its blast radius:

- **`AssertExtends` could never fail.** Both `Entities/contracts/schemas.ts` and the AI
  blueprint used `A extends B ? (B extends A ? true : never) : never`. A naked type parameter
  on the left of a conditional DISTRIBUTES over its union, so the check ran per-member and
  collapsed back to `true` — every "fails the build on drift" guard in the repo was passing
  vacuously. Fixed by wrapping both sides in one-tuples, which immediately caught the real
  drift below.
- **The AI Designer's blueprint enum was stuck at 15 types**, hidden by that guard. It now
  derives from `FORM_QUESTION_TYPES`, and its prompt template ships the full taxonomy via a
  metadata delta migration.

Also fixed, same root cause in two places: two Actions specs replaced `@memberjunction/core`
wholesale with a two-export object, so any new import in the graph broke them with an error
about a symbol the test never mentions. Both now use `importOriginal` and override only what
they fake — one of the two had been red before this change.

---

## 1. What we add

**Ten new question types**, each end-to-end (authoring → publish → render → validate →
persist → aggregate → export):

| Type | Shape | Stored in |
|---|---|---|
| `Website` | URL input | `TextValue` |
| `Checkbox` | one consent checkbox | `BooleanValue` |
| `Legal` | terms text + Accept/Decline | `BooleanValue` |
| `PictureChoice` | choice whose options carry images | `TextValue` / `JSONValue` |
| `OpinionScale` | 0/1..N with end labels | `NumericValue` |
| `Ranking` | drag options into order | `JSONValue` (ordered values) |
| `Matrix` | rows × columns, single or multi per row | `JSONValue` (row → value(s)) |
| `Address` | street / line2 / city / region / postal / country | `JSONValue` |
| `ContactInfo` | first / last / email / phone / company | `JSONValue` |
| `Signature` | canvas → PNG → existing upload path | `FileID` |

**Two new screen kinds** — `Welcome` and `Ending` — modelled as a separate `FormScreen`
entity, not as question types. See §3.

**One structural addition**: `FormPage.IsPartialSubmitPoint` (reaching the page banks a
partial response).

**Import questions was built here and has since been removed** (2026-08-21, at the product
owner's call). It was a builder-side parser turning pasted lines into questions — its own
dialog, a 200-question cap, and heuristics for inferring type and options from punctuation.
The AI assistant now covers the same job and covers it better: it reads intent rather than
punctuation, and it can place, type, and group in one turn. Keeping a second, dumber path to
the same outcome meant two code paths for "add a batch of questions", one of which nobody
would choose. Removed rather than deprecated because it had no data model of its own — the
parser was pure, so nothing published depends on it.

What this leaves open, deliberately: the AI prompt still has `InputMode: 'questions'` — the
"preserve the pasted wording verbatim, only infer types and grouping" mode described in
AI_FORM_BUILDER_SPEC §8 — and it has **no UI caller at all** now that the builder's own paste
box is gone. Wiring it to the chat is the natural home for paste-a-list if it comes back.

**Already covered, no work**: Question Group (= `FormPage`), Redirect to URL
(`FormSettings.redirectUrl`, now also per-ending), Create with AI (`generate-form.action`).

## 2. What we deliberately do NOT add, and why

Each of these needs a subsystem we do not have. A type that renders but cannot complete its
job is worse than an absent one — it looks like a promise to the author.

| Element | Blocked on |
|---|---|
| `Payment` | A payment processor + the PCI surface that comes with it. Not a question type; a checkout. |
| `Scheduler` | Calendar/availability backend (free-busy, timezone, hold-then-confirm). |
| `VideoAudio` | `MediaRecorder` is the easy half. The blocker is a storage/retention policy for multi-MB blobs on an anonymous public write path — the exact surface `FormUpload` quota-limits today. |
| `Clarify with AI` / `FAQ with AI` | A mid-form AI round-trip endpoint on the anonymous path. We have the AI Prompt infrastructure (on-submit); what is missing is an authenticated-by-magic-link, rate-limited, in-flight endpoint. |
| Hubspot / Salesforce connectors | `EntityBinding` + Actions is our analogue and already ships. Native CRM connectors are an integration roadmap item, not an element. |

## 3. Design decisions

### D1 — One capability table replaces six scattered `switch`es

Question type currently drives behaviour through duplicated switches: the widget's column
routing, the widget's `inputmode`/`type`, both validators' "is this answerable", the
reporting kind, the export shape, and a **hand-copied 15-string set in the server's
snapshot parser**. Adding ten types to that would mean sixty new branches, kept in sync by
hand.

Instead: `Entities/src/contracts/question-types.ts` holds one row per type declaring what
the rest can derive —

```
answerable   false for Statement (kills four `type === 'Statement'` special cases)
optionMode   'none' | 'values' | 'images' | 'matrix'
answerColumn 'text' | 'numeric' | 'boolean' | 'date' | 'json' | 'file'
analysis     'choice' | 'numeric' | 'boolean' | 'text' | 'composite' | 'none'
```

It lives in **Entities** because the server needs it too — that is precisely why the parser
had a copy. The Angular catalog keeps only UI concerns (icon, label, palette group) and
derives the rest.

*Special case → out of existence.* `Statement` stops being a name four modules know.

### D2 — Screens are their own entity, not question types

This is the user's explicit requirement, and it is also the correct model.

A screen is **not** answered, carries no `FormResponseAnswer`, has no validation rule, never
appears in an aggregation or export column, and cannot be referenced by a conditional rule.
Every one of those is a special case a consumer would have to write if screens were
questions — the `Statement` problem, twice over, on a type that is far more different from a
question than `Statement` is.

New table `__mj_BizAppsForms.FormScreen`:

```
ID, FormID, ScreenType ('Welcome' | 'Ending'), Title, Body, ButtonLabel,
MediaURL, RedirectURL, DisplayOrder, ConditionalRule, IsDefault
```

- **Welcome**: at most one per form. Renders *before* the intake begins, with a start button.
- **Ending**: many. After a successful submit, the first ending whose `ConditionalRule`
  matches the response wins; otherwise the `IsDefault` one; otherwise
  `FormSettings.confirmationMessage` (every already-published form keeps working).

In the widget this falls out as **phases of the shell**, which is what "different from the
intake process" means concretely:

```
loading → [welcome] → ready ⇄ submitting → [ending] → done
```

The intake components (`mjf-form-scroll` / `mjf-form-one-question`) never see a screen.

Rejected alternative: columns on `Form` (`WelcomeTitle`, `WelcomeBody`, …). Cannot express
multiple endings, which is the entire reason endings are worth separating.

### D3 — Composite answers are one JSON value, not child questions

`Address` and `ContactInfo` store a fixed-key object in `JSONValue`.

Rejected alternative: expand each into child questions. It doubles the question count in
every list, makes `isRequired` ambiguous (required *street*, or required *address*?), and
gives conditional rules N ids where the author sees one field.

### D4 — `Matrix` and `Ranking` reuse `FormQuestionOption`

`Ranking` = options, answer is the ordered array of their values. `Matrix` = options split
into rows and columns by a `MatrixAxis` discriminator on the option row. No new child table;
the existing option editor extends rather than forks.

## 4. Risk / deploy order

- The migration widens `CK_FormQuestion_QuestionType` and adds a table. **Apply before
  deploying the code** — the reverse order lets the builder write a type the constraint
  rejects, and the failure surfaces as a save error with no explanation.
- Requires a CodeGen run (`npm run mj:codegen`) after the migration; TypeScript against the
  new columns is written only after it.
- `metadata/` changes need `mj sync push` + a regenerated `Metadata_Sync.sql`, or they ship
  as nothing.
