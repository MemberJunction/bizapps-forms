# MJ Forms help center — design

**Status:** approved 2026-09-15. Implemented by
[`docs/superpowers/plans/2026-09-15-help-center.md`](../plans/2026-09-15-help-center.md).

## The problem

Every document in this repository is written for a developer or an operator. `docs/install.md`,
`docs/database-operations.md`, `docs/release.md` and `docs/on-submit-automations.md` all assume a
terminal, a checkout and a database. The Pages site at
<https://memberjunction.github.io/bizapps-forms/> is a design gallery aimed at people evaluating the
product's look.

Nobody has written a word for the person the product is actually for: a non-technical member of
staff who opens Explorer, clicks **Forms**, and has to build and publish a survey.

The product gives them no help either. There is not one `href` to documentation anywhere in
`packages/Angular/src/lib` — guidance today is entirely hint text, tooltips and empty-state copy.
That copy is unusually good, which is a large part of why this gap went unnoticed.

## Audience, and what is out of scope

**In scope — the form author.** A non-technical person working inside Explorer who builds a form,
publishes it, shares it and reads the answers. They know their own domain. They do not know what an
entity, a snapshot, a distribution or a magic link is, and they must never need to.

**In scope — the respondent, minimally.** One FAQ page covering the two things that generate
questions: resuming saved answers, and a form that refuses to open. Authors get sent these questions
and need an answer to forward.

**Out of scope — the administrator.** Installing MJ Forms, configuring Turnstile keys, running
migrations. That reader is served by `docs/install.md` and is a different person with a different
vocabulary. The help center links to it once and does not duplicate it.

## Decision 1 — a Docsify site under `docs/help/`

GitHub Pages already serves this repository's `docs/` directory from `main` as static files, with
`.nojekyll` present. A folder of raw Markdown dropped there renders on github.com but not on the
site.

The help center is therefore `docs/help/`: a folder of Markdown plus one `index.html` that loads
[Docsify](https://docsify.js.org) 5.0.0 from jsDelivr and renders those Markdown files in the
browser. It gives a sidebar, full-text search and a mobile layout with **no build step, no workflow
change and no new dependency in the pnpm workspace.**

Why this rather than the two alternatives:

- **MJ's Astro Starlight tooling.** It is the better long-term answer and the wrong first move. It
  needs a build job, a switch from legacy Pages to Actions deploys, and an ingest script to
  maintain. That is infrastructure work standing between the reader and the first sentence of help
  they have never had.
- **A GitHub wiki.** Not reviewed in pull requests, not versioned with the product, and it drifts
  the moment a release changes a label.

Markdown in the repository keeps the articles reviewable like code, versioned with the product, and
readable on github.com if the site is ever unavailable. The runtime CDN dependency matches what
`docs/index.html` already does with Font Awesome and Google Fonts.

The site is themed to match the existing gallery so the two read as one property.

## Decision 2 — bold means an on-screen label, and a gate enforces it

The failure mode for this kind of documentation is not being wrong on the day it ships. It is being
wrong eighteen months later, when a button was renamed and nobody remembered an article quoted it.

So the house style makes one reservation: **bold is used only for text that appears on screen.**
Emphasis uses italics. Nothing else may be bold.

That single rule makes an entire class of documentation rot mechanically detectable.
`scripts/check-help-docs.mjs` extracts every bold span from `docs/help/**/*.md` and fails if a span
is neither found verbatim in `packages/Angular/src` or `packages/Server/src` nor listed in
`docs/help/.ui-strings-allow.txt`. Rename a button and the documentation build goes red on the same
pull request that renamed it.

The allowlist exists because some on-screen text is composed at runtime (`Page <n>`) or comes from
MJ core rather than this repository. Every entry carries a reason.

The same script checks that internal links and images resolve, and that every article is reachable
from the sidebar. An absolute GitHub URL into this repository's own files counts as internal and
resolves from the repository root: `docs/install.md` sits outside the site, so that is the only way
to link it, and skipping it would leave the site's one link to a release-renameable file unchecked.

It also checks the return direction: the five help-centre URLs in
`packages/Angular/src/lib/shared/help-links.ts`, which the in-product empty states send a stuck
reader to, must each name an article that exists on disk. Both sides of that file are counted — one
literal `#/article` route per exported link — so a URL assembled from pieces, which the route
pattern cannot see, fails rather than going out unverified.

**It is wired into an existing required job, not a new workflow.** The seven required checks are
fixed in a repository ruleset that nobody, including administrators, can bypass. A new workflow
would not be required, and making it required is an administrator action. Adding a step to a job
that is already required gets enforcement immediately and for free.

**That job is `changes_and_migrations` in `.github/workflows/changes.yml`, and specifically NOT
`build-and-test`.** `build-and-test` is gated by a `scope` job whose prefix list (pinned by
`scripts/check-paths-touched.spec.mjs`) deliberately excludes `docs/`, because an article does not
need a thirty-minute build. So on a docs-only pull request that decider answers `false`, the job
reports `skipped`, and a required status check counts `skipped` as PASSING. Wiring the gate there
would mean the only pull requests it exists to check are exactly the ones it never runs on — a green
required check over a gate that did not execute. `changes_and_migrations` runs unconditionally on
every pull request to `next` and `main`, and is already checked out with Node 24, which the gate
needs nothing more than.

The gate's **unit tests** do live in `build-and-test`, and correctly: they only need to run when the
gate itself changes, and `scripts/` IS in the path decider's list.

## Decision 3 — orientation screenshots, not step screenshots

The research on help-center writing says to pair complex steps with an image. Taken literally for 29
articles that is roughly seventy screenshots, each pinned to a click target, each rotting the moment
a panel moves.

Instead: about fifteen **orientation** images, one per major surface, answering "where am I and what
am I looking at". That is the question a non-technical reader actually has, it is the question prose
answers worst, and a surface survives a redesign far longer than a button's position does.

Screenshots are captured by `scripts/capture-help-screenshots.mjs` driving a real browser against a
purpose-built demo form, so they can be regenerated rather than re-staged by hand.

**No screenshot may contain a real person's data.** The development database holds real-looking
respondent records, and response, insight and respondent-profile views display them. The demo form
carries fabricated answers, and it is the source for every image.

## Decision 4 — the README is corrected in the same effort

`README.md` lists eight items under "What's next". Three of them shipped: authoring with AI, the
per-form captcha toggle, and cross-session resume. A help center that documents a feature the
README calls future work contradicts itself on the repository's front page.

## Article map

29 articles. Every one maps to a feature verified present in the source.

| Section | Articles |
|---|---|
| Get started | Your first form; Where everything lives |
| Build | Add and arrange questions; The 25 question types; Required answers and validation; Sections, welcome and ending screens; Show, skip and branch; Score answers; Reuse a form as a template; Let AI draft a form |
| Design | Brand a form; Preview on phone and tablet |
| Share | Publish; Create a share link; Embed in your own site; QR code; Limits and dates; Require a captcha; Why a link is not working |
| Responses | Read responses; Export; Insights; Uploaded files |
| Automate | What happens after submit; Save answers into a record; Run an action or an agent |
| Reference | Glossary; Questions respondents ask; What MJ Forms cannot do yet |

## Writing standard

Recorded in `docs/help/STYLE.md`, enforced by review and, where mechanical, by the gate.

- Second person, present tense, active voice. "Open the Distribute tab", never "the Distribute tab
  should be opened".
- Verb-first titles that match what someone would search for.
- One task per article, finished completely.
- A fixed skeleton: a one-sentence outcome, *Before you start*, numbered steps, *What happens next*,
  *Related*.
- Plain words. No internal vocabulary. A respondent-facing or database term is defined once in the
  glossary and linked, never explained twice.
- Bold is reserved for on-screen text, as above.
- Never promise a feature that is not shipped. The list of those lives in one article so it can be
  checked in one place.

## Verification

- `npm run lint:help` passes, inside `changes_and_migrations`.
- `npm run lint:help:test` passes, inside `build-and-test` — unit tests for the gate's pure
  functions, following this repository's `node --test` + `.spec.mjs` convention.
- The rendered site is loaded in a browser and read, on desktop and at phone width, before merge.
- The tutorial is executed against the running product, not written from the source.

## Known follow-ups, deliberately not in this change

- Ingesting these articles into MJ's Starlight site once that site accepts sibling-repository
  content.
- A `bizapps-forms` card in MJ's `docs-site` ecosystem list, which is a change to the MJ
  repository, not this one.
- Localisation.
