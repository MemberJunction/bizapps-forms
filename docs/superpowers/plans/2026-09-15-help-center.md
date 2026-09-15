# MJ Forms help center — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a task-based help center for non-technical form authors at
`docs/help/`, published on the existing GitHub Pages site, with a CI gate that fails when an
article quotes a button that no longer exists.

**Architecture:** A folder of Markdown rendered by a single Docsify `index.html`. No build step, no
new workspace dependency. One house rule — bold means on-screen text — makes documentation rot
mechanically detectable, and `scripts/check-help-docs.mjs` enforces it from inside the already-required
`build-and-test` job.

**Tech Stack:** Markdown, Docsify 5.0.0 from jsDelivr, Node 24 stdlib for the gate, Vitest for the
gate's tests, Playwright for screenshot capture.

**Spec:** [`docs/superpowers/specs/2026-09-15-help-center-design.md`](../specs/2026-09-15-help-center-design.md)

## Global Constraints

- **Branch:** `docs/help-center`, cut from `next`. It MUST track `origin/docs/help-center`, never
  `origin/next`. Verify with `git branch -vv` before every push.
- **No changeset is required.** `changes.yml` demands one only when `migrations/*.sql` changes.
- **No commits without explicit approval** beyond the one already given for this work.
- **Bold is reserved for exact on-screen text.** Emphasis uses italics. This is enforced.
- **Every on-screen string must be copied from a facts file, never recalled.** The three facts files
  live in the session scratchpad at `helpfacts/01-builder-copy.md`, `02-share-results-copy.md`,
  `03-respondent-copy.md`. They were extracted from the templates and are authoritative.
- **Four corrections that override intuition:** the Distribute view switcher reads "Link", not
  "Public link"; the Design tab has no reset-to-default control; the Responses **tab** has no export
  button (export is on the Responses & Analytics dashboard as "CSV" and "Excel"); "Scroll" mode shows
  one section per step, not the whole form at once.
- **Never promise an unshipped feature.** Not shipped: review/approve-before-publish via
  bizapps-tasks, a Payment question type, FormGroup/view projection, AI answer scores shown in the
  UI, calculated fields, advanced quotas, and the emailed cross-device resume channel.
- **No real person's data in any screenshot.**
- **Voice:** second person, present tense, active. Verb-first titles.
- **Article skeleton:** H1 title, one-sentence outcome, `## Before you start`, numbered steps,
  `## What happens next`, `## Related`.
- **US-neutral spelling is not enforced;** match the product, which uses British spellings in places
  ("colour", "Align centre", "summarise"). When quoting a label, quote it exactly.

---

### Task 1: Site shell, house style and glossary

**Files:**
- Create: `docs/help/index.html`, `docs/help/theme.css`, `docs/help/README.md`,
  `docs/help/_sidebar.md`, `docs/help/_navbar.md`, `docs/help/STYLE.md`,
  `docs/help/reference/glossary.md`, `docs/help/.ui-strings-allow.txt`

**Interfaces:**
- Produces: the sidebar file every later task appends to; the article skeleton every later task
  follows; `.ui-strings-allow.txt`, one entry per line with a `#` comment giving the reason.

- [ ] **Step 1: Write `docs/help/index.html`**

A Docsify shell pinned to an exact version. Load `docsify@5.0.0/dist/docsify.min.js`,
`dist/themes/core.min.css`, `dist/themes/addons/core-dark.min.css` and
`dist/plugins/search.min.js` from `cdn.jsdelivr.net`. Configure `name: 'MJ Forms help'`,
`loadSidebar: true`, `loadNavbar: true`, `subMaxLevel: 2`, `auto2top: true`, and the search plugin
with `depth: 3` and `placeholder: 'Search the help'`. Set `<title>MJ Forms help</title>` and a
meta description. Link `theme.css` after the Docsify themes so it wins.

- [ ] **Step 2: Write `docs/help/theme.css`**

Match `docs/index.html`'s identity: the Sora typeface from Google Fonts, accent `#7c5cff`, dark
surface `#0b0f1a`. Define the palette as custom properties on `:root`, override for light mode, give
`body` an explicit background, and keep the layout usable at 360px wide. This file is not scanned by
`check-ui-tokens.mjs` (it scans only `packages/Angular/src`), so literal colours are correct here —
say so in a comment.

- [ ] **Step 3: Write `docs/help/STYLE.md`**

The writing contract, addressed to a contributor. Cover: audience; verb-first titles; the fixed
article skeleton; second person and present tense; one task per article; plain words with no
internal vocabulary; the bold rule and why it exists (it is what makes the gate possible); the
orientation-not-step screenshot rule; and the instruction never to promise an unshipped feature.

- [ ] **Step 4: Write `docs/help/reference/glossary.md`**

Every term a reader meets on screen or in these articles, in their words. At minimum: form, draft,
published, version, section, welcome screen, ending screen, share link, response limit, partial
response, respondent, captcha, template, automation, record, insights. Each entry is one or two
sentences, with no database vocabulary.

- [ ] **Step 5: Write `docs/help/README.md`, `_sidebar.md`, `_navbar.md`**

`README.md` is the landing page: a one-paragraph statement of what MJ Forms is for a form author,
then "Start here" pointing at the tutorial, then the seven sections as a short list of links.
`_sidebar.md` carries the full nav grouped by section. `_navbar.md` links back to the repository and
to the design gallery.

- [ ] **Step 6: Seed `.ui-strings-allow.txt`**

Start with the bold spans the articles will legitimately use that are not verbatim source strings:
skeleton headings (`Before you start`, `What happens next`, `Related`) are `##` headings, not bold,
so they do not appear. Seed only entries you actually need, each with a `#` comment naming the
reason. An empty file with a header comment is a valid start.

- [ ] **Step 7: Verify it renders**

Serve the folder and load it in a browser:

```bash
cd docs && python3 -m http.server 8899
```

Open `http://localhost:8899/help/`, confirm the sidebar, search and dark mode all work, then check it
again at 360px wide. Fix anything broken before moving on.

- [ ] **Step 8: Commit**

```
docs(help): site shell, house style and glossary
```

---

### Task 2: The `check:help` gate and its tests

**Files:**
- Create: `scripts/check-help-docs.mjs`, `scripts/check-help-docs.spec.mjs`
- Modify: `package.json` (add `check:help`), `.github/workflows/build.yml` (add a step to
  `build-and-test`)

**Interfaces:**
- Consumes: `docs/help/**/*.md`, `docs/help/_sidebar.md`, `docs/help/.ui-strings-allow.txt`,
  `packages/Angular/src`, `packages/Server/src`.
- Produces: exported pure functions `extractBoldSpans(markdown)`, `extractLinks(markdown)` and
  `findUnverifiedStrings({ spans, sourceText, allowlist })`, all importable by the spec file. The
  script exits non-zero on any violation and prints `file:line` for each.

- [ ] **Step 1: Write the failing tests**

`scripts/check-help-docs.spec.mjs`, following the repository's existing `scripts/*.spec.mjs`
convention. Cover at least:

```js
import { describe, it, expect } from 'vitest';
import { extractBoldSpans, extractLinks, findUnverifiedStrings } from './check-help-docs.mjs';

describe('extractBoldSpans', () => {
  it('finds a double-asterisk span', () => {
    expect(extractBoldSpans('Click **Publish** now.')).toEqual([{ text: 'Publish', line: 1 }]);
  });
  it('ignores a bold marker inside a fenced code block', () => {
    expect(extractBoldSpans('```\n**not a label**\n```\n')).toEqual([]);
  });
  it('ignores inline code', () => {
    expect(extractBoldSpans('`**literal**`')).toEqual([]);
  });
  it('reports the correct line number', () => {
    expect(extractBoldSpans('a\nb\n**Save**')).toEqual([{ text: 'Save', line: 3 }]);
  });
});

describe('findUnverifiedStrings', () => {
  it('passes a span present in the source', () => {
    expect(findUnverifiedStrings({
      spans: [{ text: 'Publish', line: 1 }], sourceText: 'x "Publish" y', allowlist: new Set(),
    })).toEqual([]);
  });
  it('flags a span absent from the source', () => {
    expect(findUnverifiedStrings({
      spans: [{ text: 'Pubish', line: 4 }], sourceText: 'x "Publish" y', allowlist: new Set(),
    })).toEqual([{ text: 'Pubish', line: 4 }]);
  });
  it('passes an allowlisted span that is absent from the source', () => {
    expect(findUnverifiedStrings({
      spans: [{ text: 'Page 2', line: 1 }], sourceText: '', allowlist: new Set(['Page 2']),
    })).toEqual([]);
  });
});

describe('extractLinks', () => {
  it('finds a relative markdown link', () => {
    expect(extractLinks('see [x](../build/logic.md)')).toContainEqual(
      expect.objectContaining({ target: '../build/logic.md' }));
  });
  it('ignores an external link', () => {
    expect(extractLinks('[x](https://example.com)')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms && npx vitest run scripts/check-help-docs.spec.mjs
```

Expected: failure, because the module does not exist.

- [ ] **Step 3: Write `scripts/check-help-docs.mjs`**

Node stdlib only, matching the other gates in `scripts/`. A file header comment must explain *why*
the bold rule exists, because that is the non-obvious part a later reader will otherwise delete.

Three checks:

1. **UI strings.** For every `docs/help/**/*.md`, extract bold spans outside fenced and inline code.
   Concatenate every `.ts` and `.html` file under `packages/Angular/src` and `packages/Server/src`
   once into a single haystack. A span passes if it appears verbatim in that haystack or is in the
   allowlist. Report every failure as `file:line  "text"` with a one-line hint to add it to the
   allowlist with a reason if it is legitimately composed at runtime.
2. **Links and images.** Every relative `.md` link target and every image path must resolve on disk.
   External links are skipped.
3. **Reachability.** Every `docs/help/**/*.md` except `README.md`, `STYLE.md` and files beginning
   with `_` must be linked from `_sidebar.md`.

Export the three pure functions named above. Exit 0 with a one-line summary when clean.

- [ ] **Step 4: Run the tests and the gate**

```bash
npx vitest run scripts/check-help-docs.spec.mjs && node scripts/check-help-docs.mjs
```

Expected: tests pass, and the gate passes against the Task 1 content.

- [ ] **Step 5: Wire it into `package.json` and CI**

Add `"check:help": "node scripts/check-help-docs.mjs"` to `scripts`. In
`.github/workflows/build.yml`, add a step to the **existing `build-and-test` job**, after the other
lint steps:

```yaml
      - name: Check help docs
        run: npm run check:help
```

Do **not** create a new workflow. A new workflow would not be a required check, and making one
required is an administrator action nobody here can take.

- [ ] **Step 6: Commit**

```
docs(help): gate that fails when an article quotes a button that no longer exists
```

---

### Task 3: Get started

**Files:**
- Create: `docs/help/get-started/first-form.md`, `docs/help/get-started/where-everything-lives.md`
- Modify: `docs/help/_sidebar.md`

**Interfaces:**
- Consumes: the skeleton and bold rule from `STYLE.md`; facts file 01.

- [ ] **Step 1: Execute the tutorial against the running product**

The MJ host is already up (API on `:4000`, Explorer on `:4201`, authenticated). Drive it with
Playwright: open Explorer, go to Forms, create a form, add two questions, publish it, create a share
link, open that link, submit an answer, and read it back. Write down what actually happened,
including anything that surprised you. The plan notes that these Explorer surfaces have never been
exercised end to end by a human, so treat every step as unverified until you have seen it.

- [ ] **Step 2: Write `first-form.md`**

The one tutorial. Ten minutes, start to finished response, from what you just observed — not from
the source. Follow the skeleton. Quote labels exactly from facts file 01 ("New form", "Build",
"Publish", "Distribute", "Create a share link", "Copy link"). End by telling the reader where their
response now lives.

- [ ] **Step 3: Write `where-everything-lives.md`**

Orientation. The two places Forms appears in Explorer — the **Forms** app for building, and
**Responses & Analytics** for reading — and the five builder tabs "Build", "Design", "Distribute",
"Automate", "Responses" in one line each. Say plainly that export lives on the dashboard and not on
the Responses tab, because that is the single most likely wasted afternoon.

- [ ] **Step 4: Add both to `_sidebar.md`, then run the gate**

```bash
node scripts/check-help-docs.mjs
```

- [ ] **Step 5: Commit**

```
docs(help): the first-form tutorial and an orientation page
```

---

### Task 4: Build section

**Files:**
- Create: `docs/help/build/add-and-arrange-questions.md`, `question-types.md`,
  `required-and-validation.md`, `sections-and-screens.md`, `logic.md`, `scoring.md`,
  `templates.md`, `author-with-ai.md` (all under `docs/help/build/`)
- Modify: `docs/help/_sidebar.md`

**Interfaces:**
- Consumes: facts file 01 exclusively. Every label in this section comes from it.

- [ ] **Step 1: Write `question-types.md` first**

A table of all 25 types: the exact label, the product's own hint, and a "use this when" sentence you
write. The 25 labels and hints are listed verbatim in facts file 01 — copy them, do not paraphrase.
Group them under the seven palette headings "Contact", "Text", "Choice", "Scale", "Date", "Upload",
"Structure". This article is the section's reference and the others link to it.

- [ ] **Step 2: Write `add-and-arrange-questions.md`**

Adding from the palette, the "Insert a question" dialog, reordering with "Move up" and "Move down",
deleting, and the "Question settings" panel with "Question" and "Description". Mention the reorder
safety net: moving a question that rules depend on shows a banner with "Undo".

- [ ] **Step 3: Write `required-and-validation.md`**

The "Required" toggle and its hint. Then "Answer validation": "Min length", "Max length", "Minimum
value", "Maximum value", "Pattern (regular expression)" and "Message shown when the pattern fails".
Explain the pattern field in plain words and say a non-technical author can ignore it. Include the
contradictory-bounds behaviour, quoting the message.

- [ ] **Step 4: Write `sections-and-screens.md`**

Sections as pages, "Add a section", page titles and descriptions, "Save progress here" and what a
partial response means for the respondent, the "Welcome screen", and "Endings" including "Add an
ending" and "Add a conditional ending". Cover the ending reach labels, because "Never shown — no
rule sends anyone here" is confusing without an explanation.

- [ ] **Step 5: Write `logic.md`**

The most-needed and hardest article. The "Edit logic" dialog: "Show this question" with "Always" and
"Only when…", then "Then, after this question" with ordered "Then go to" rules. State the two rules
that govern everything: first match wins, and you can only jump forwards. List the operators
verbatim. Cover "Total score" as a condition source, the reach warnings, and the publish refusal —
quote it, because a reader who hits it needs to recognise it.

- [ ] **Step 6: Write `scoring.md`**

The "Scoring" setting, points per option, "Total score" as a condition, and routing to an ending by
score band. Worked example: a readiness quiz with three endings. State plainly that scores are not
shown to the respondent and are not included in the export.

- [ ] **Step 7: Write `templates.md` and `author-with-ai.md`**

Templates: "Save as template", the "Save as template" dialog with "Template name" and "What is it
for?", what is copied and what is not (quote the note), the gallery's "Your templates" and "Starter
templates", and the five starter templates with their descriptions. AI: "Author with AI", "Describe
the form you want", the placeholder as an example of a good brief, "Generate", and the honest
expectation that it produces a draft to edit.

- [ ] **Step 8: Add all eight to `_sidebar.md`, run the gate, commit**

```
docs(help): the Build section — questions, validation, logic and scoring
```

---

### Task 5: Design and Share sections

**Files:**
- Create: `docs/help/design/brand-a-form.md`, `docs/help/design/preview.md`,
  `docs/help/share/publish.md`, `share-link.md`, `embed.md`, `qr-code.md`,
  `limits-and-dates.md`, `captcha.md`, `why-a-link-is-not-working.md` (last seven under
  `docs/help/share/`)
- Modify: `docs/help/_sidebar.md`

**Interfaces:**
- Consumes: facts file 02 exclusively.

- [ ] **Step 1: Write `design/brand-a-form.md`**

Follow the four sub-tabs in order: "Logo", "Font", "Buttons", "Background". Every control with its
label and the product's own hint. Include the contrast warning and tell the reader to heed it. State
that there is no reset-to-default control, so noting the original colour first is worth doing. End
with the status line "Saved · publish to put it live" and what it means.

- [ ] **Step 2: Write `design/preview.md`**

"Preview", the "Desktop", "Tablet" and "Mobile" widths, and the advice to check the phone width
before every publish.

- [ ] **Step 3: Write `share/publish.md`**

What publishing does in the reader's terms: it takes a copy of the form as it stands and that copy
is what people answer. Editing afterwards changes nothing until "Publish changes". Cover the four
published states verbatim, especially "Published, not shared", which is the state a first-time
author lands in and misreads as a failure.

- [ ] **Step 4: Write `share/share-link.md`, `embed.md`, `qr-code.md`**

Link: "Create a share link", the "Link" view, "Copy link", "Open it yourself", and that several
links can exist with separate settings and separate counts. Embed: the "Embed" view, "Copy snippet",
and "Sites allowed to show this form" with a clear warning that listing sites can stop a form
already live on a page — quote the hint. QR: "Download the QR code", that it is a vector file safe
to print at any size, and both warnings.

- [ ] **Step 5: Write `share/limits-and-dates.md` and `captcha.md`**

Limits: "Open to responses", "Response limit", "Expires", and what a respondent sees in each case
(pull those from facts file 03). Captcha: "Require a captcha", that it needs server configuration,
and the exact message a respondent sees when it is on without a site key — an author who turns this
on unconfigured takes their own form offline, so say so in the first paragraph.

- [ ] **Step 6: Write `share/why-a-link-is-not-working.md`**

The troubleshooting article, and likely the most-visited. A table of the six state badges — "Not
ready", "Paused", "Scheduled", "Live", "Finished", "Limit reached" — each with the product's own
explanation and its fix button. Then a short list of symptoms a reader arrives with, each pointing
at a row.

- [ ] **Step 7: Add all nine to `_sidebar.md`, run the gate, commit**

```
docs(help): the Design and Share sections
```

---

### Task 6: Responses and Automate sections

**Files:**
- Create: `docs/help/responses/read-responses.md`, `export.md`, `insights.md`, `files.md`,
  `docs/help/automate/after-submit.md`, `save-into-a-record.md`, `actions-and-agents.md`
- Modify: `docs/help/_sidebar.md`

**Interfaces:**
- Consumes: facts file 02 exclusively.

- [ ] **Step 1: Write `responses/read-responses.md`**

The "Responses" tab: the columns, "Search respondent", the status filter and the fact that it only
appears when both statuses are present. The detail view, "Back to responses", and the "What this
submission did" panel. Explain a partial response in the reader's terms.

- [ ] **Step 2: Write `responses/export.md`**

Lead with the correction: export is **not** on the Responses tab. It is on the Responses &
Analytics dashboard, as "CSV" and "Excel" under "Export responses". Say what a row is, that AI
scores are excluded, and what to do about uploaded files.

- [ ] **Step 3: Write `responses/insights.md`**

The "Insights" mode section by section: the summary stats, "Where people stop", "What they chose",
"What they wrote" and "Who responded". For each, the question it answers. Quote the caveats
verbatim — "A starting point for reading, not a summary" and the note that spellings are not merged
— because a reader who over-trusts these panels will make a bad decision. Mention the "Sample data"
badge.

- [ ] **Step 4: Write `responses/files.md`**

Downloading an uploaded file, the "Revoked" and "Details unavailable" badges, and the 10 MB limit
with the message a respondent sees.

- [ ] **Step 5: Write `automate/after-submit.md`**

The "Automate" tab. Lead with the guarantee, in the product's own words: answers are saved first,
always. The four built-in steps with their descriptions. The per-step settings "Switched on", "Run
it in sequence", "Carry on if it fails" and "Position". End with the one trap: a step you configure
but do not publish does nothing.

- [ ] **Step 6: Write `automate/save-into-a-record.md` and `actions-and-agents.md`**

Saving into a record is the product's headline capability and needs the most careful plain-English
treatment: what a record is, picking one, mapping answers to fields, "If it already has a value",
"If the record already exists", and "Try it against a real response" as the safe way to check before
committing. Actions and agents: what each is in one sentence, how to pick one, and that the list
depends on what the organisation has set up.

- [ ] **Step 7: Add all seven to `_sidebar.md`, run the gate, commit**

```
docs(help): the Responses and Automate sections
```

---

### Task 7: Reference section, and the README correction

**Files:**
- Create: `docs/help/reference/respondent-questions.md`, `docs/help/reference/not-yet.md`
- Modify: `docs/help/_sidebar.md`, `README.md`

**Interfaces:**
- Consumes: facts file 03 for the respondent article.

- [ ] **Step 1: Write `reference/respondent-questions.md`**

Written for an author to forward. Each entry is a question in a respondent's words with an answer in
theirs: why the form says it has changed since they saved; what "Not you? Start over" does and that
it does not delete the old draft; why a form will not open, covering every server page verbatim; the
session-timeout dialog; why a file was refused; and what the security challenge is.

- [ ] **Step 2: Write `reference/not-yet.md`**

The honest list, so the rest of the help center never has to hedge: approval before publishing,
Payment questions, AI scores in the UI, calculated fields, advanced quotas, and resuming on a
different device by email. One line each, no dates promised.

- [ ] **Step 3: Correct `README.md`**

In "What's next", remove the three shipped items — authoring with AI, the per-form captcha toggle
and cross-session resume. Keep the five that are genuinely unshipped. Add one line linking the help
center.

- [ ] **Step 4: Add both to `_sidebar.md`, run the gate, commit**

```
docs(help): reference section, and stop the README calling shipped features future work
```

---

### Task 8: Orientation screenshots

**Files:**
- Create: `scripts/capture-help-screenshots.mjs`, `docs/help/images/*.png`
- Modify: the articles that gain an image

**Interfaces:**
- Consumes: a running MJ host on `:4000` and `:4201`, authenticated.

- [ ] **Step 1: Build the demo form**

Through the UI, create a form named "Volunteer signup" with obviously fabricated content and four or
five responses whose names, emails and organisations are plainly invented. This form is the only
source for every image. Real records must not appear in any shot, and response, insight and
respondent-profile views display them by default.

- [ ] **Step 2: Write `scripts/capture-help-screenshots.mjs`**

A Playwright script that navigates to each surface and writes a PNG into `docs/help/images/`. It is
an on-demand tool, not a gate. Its header comment must record which form it expects and why the data
must be fabricated. Capture at a fixed viewport so images stay consistent; note that this machine
reports a device pixel ratio of 0.5, so verify the written file's real dimensions rather than
trusting the requested size.

- [ ] **Step 3: Capture roughly fifteen images**

The Forms home; the Build tab whole; the question settings panel; the "Edit logic" dialog; the
Design tab; the three Distribute views; the Automate tab; the Responses tab; a response detail; the
Insights dashboard; the templates gallery; and the respondent form at desktop and phone width.

- [ ] **Step 4: Embed them**

One orientation image near the top of each article that has a matching surface. Every image needs
alt text that describes what is shown, not what it is called.

- [ ] **Step 5: Check every image for real data, then run the gate and commit**

```
docs(help): orientation screenshots, captured from a demo form
```

---

### Task 9: Make the help discoverable

**Files:**
- Modify: `README.md`, `docs/index.html`, and the Angular empty-state templates that gain a link

**Interfaces:**
- Consumes: the published URL `https://memberjunction.github.io/bizapps-forms/help/`.

- [ ] **Step 1: Link it from the repository front door**

A line in `README.md` near the top, and a card or link in `docs/index.html` so the gallery and the
help center reach each other.

- [ ] **Step 2: Add in-app links to the empty states**

The empty states are the natural place, because a reader there is stuck by definition. Add a link to
the matching article in, at minimum, the forms-home empty state, the Distribute empty state, the
Automate empty state and the rule-editor empty state. Keep each to a few words. Use
`<a target="_blank" rel="noopener">`.

The site and the Angular package reach a host in the same release, so the links are live when users
first see them.

- [ ] **Step 3: Build and test the Angular package**

```bash
cd packages/Angular && pnpm run build && pnpm test
```

Both must pass. `check-ui-tokens.mjs` scans this package, so add no literal colours.

- [ ] **Step 4: Run the whole gate set**

```bash
npm run check:help && npm run check:ui-tokens
```

- [ ] **Step 5: Commit**

```
docs(help): link the help center from the product and the README
```

---

### Task 10: Read the site and open the pull request

- [ ] **Step 1: Read the rendered site**

Serve `docs/` and read every article in a browser at desktop width and at 360px. You are checking
for what only shows up rendered: a broken table, an unreadable colour, a sidebar that does not match
the articles, a page that reads as a feature tour rather than a task.

- [ ] **Step 2: Run everything**

```bash
npm run check:help && npx vitest run scripts/check-help-docs.spec.mjs
```

- [ ] **Step 3: Push, fixing the tracking branch**

```bash
git push -u origin docs/help-center
git branch -vv | grep help-center
```

The second command must show `[origin/docs/help-center]`, not `[origin/next]`.

- [ ] **Step 4: Open the pull request into `next`**

Base `next`, never `main`. The body states what shipped, the three decisions and their reasons, that
the README correction is included, and how a reviewer can serve the site locally.

---

## Self-review

**Spec coverage.** Docsify shell, Task 1. Bold rule and gate, Task 2. 29 articles, Tasks 1 and 3
through 7. Orientation screenshots, Task 8. README correction, Task 7. Discovery, Task 9. Every
spec section has a task.

**Placeholders.** None. Each article task names its files, its facts file and its required content.

**Consistency.** `extractBoldSpans`, `extractLinks` and `findUnverifiedStrings` are named identically
in Task 2's tests and implementation. `docs/help/` paths are consistent across tasks. Sidebar updates
are folded into the task that creates the articles rather than deferred.
