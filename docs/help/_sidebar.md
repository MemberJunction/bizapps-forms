<!--
  The help centre's navigation. Read this before editing it.

  1. Paths start with "/" here, and only here. index.html sets relativePath:true so that links
     inside articles can be written the way they sit on disk. The side effect is that a link in
     this file — which is rendered on every page, from every folder — would otherwise be resolved
     against whichever folder the reader is standing in. Leave the leading slash alone.

  2. Group titles are plain text, not bold. Bold in this help centre means "this text is on the
     screen in the product", and scripts/check-help-docs.mjs enforces that against the source.
     "Get started" and "Reference" are our words, not the product's, so they must not be bold.

  3. This file lists the articles that EXIST, and adding an article and listing it here are the
     same commit. The gate checks both directions: an article no group lists is unreachable, and a
     group entry pointing at a file that is not there is a dead link. The second half is the one
     worth defending. A navigation entry that goes nowhere is the worst dead link a help centre can
     have, so exempting this file from link resolution — to keep a running order of unwritten
     articles visible — would hide precisely the failure the check exists to catch, and a gate that
     is knowingly red mid-branch teaches everyone to ignore a red gate.

     While the running order was still being written, the unwritten articles were parked in a
     comment at the foot of this file — not rendered, not linked, therefore not a claim about
     anything — and each line moved up into the list below in the commit that added its article.
     That comment is now empty and gone: every planned article exists. If you plan a run of new
     articles, park them the same way rather than listing a file that is not there yet.
-->

- Get started
  - [Create your first form](/get-started/first-form.md)
  - [Where everything lives](/get-started/where-everything-lives.md)

- Build
  - [Add and arrange questions](/build/add-and-arrange-questions.md)
  - [The 25 question types](/build/question-types.md)
  - [Require and check answers](/build/required-and-validation.md)
  - [Add sections and screens](/build/sections-and-screens.md)
  - [Show, skip and branch](/build/logic.md)
  - [Score answers](/build/scoring.md)
  - [Reuse a form as a template](/build/templates.md)
  - [Let AI draft a form](/build/author-with-ai.md)

- Design
  - [Brand a form](/design/brand-a-form.md)
  - [Preview on phone and tablet](/design/preview.md)

- Share
  - [Publish a form](/share/publish.md)
  - [Create a share link](/share/share-link.md)
  - [Embed in your own site](/share/embed.md)
  - [Share a QR code](/share/qr-code.md)
  - [Set limits and dates](/share/limits-and-dates.md)
  - [Require a captcha](/share/captcha.md)
  - [Why a link is not working](/share/why-a-link-is-not-working.md)

- Responses
  - [Read responses](/responses/read-responses.md)
  - [Export responses](/responses/export.md)
  - [Read the insights](/responses/insights.md)
  - [Find uploaded files](/responses/files.md)

- Automate
  - [What happens after submit](/automate/after-submit.md)
  - [Save answers into a record](/automate/save-into-a-record.md)
  - [Run an action or an agent](/automate/actions-and-agents.md)

- Reference
  - [Glossary](/reference/glossary.md)
  - [Questions respondents ask](/reference/respondent-questions.md)
  - [What MJ Forms cannot do yet](/reference/not-yet.md)
