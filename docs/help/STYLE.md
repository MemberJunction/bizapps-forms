# House style

This page is for people *writing* the MJ Forms help centre. Readers never see it.

Read it before you add or change an article. The mechanical half is enforced by
`npm run lint:help`, which is a required check on every pull request. The rest is enforced by
review, and by you.

---

## 1. Who you are writing for

A member of staff who has been asked to put a survey out by Friday. They know their own subject
perfectly. They have never installed anything, have never seen a database, and did not choose this
tool.

They are not stupid and they are not in a hurry to be flattered. Write to a competent adult who is
unfamiliar with *this software*, not with computers.

Three readers are explicitly *not* your audience:

- *The administrator.* Installing MJ Forms, configuring captcha keys, running migrations. That
  reader has `docs/install.md`. Link to it once; never re-explain it.
- *The developer.* Nothing in these articles refers to a package, a schema, a resolver or an API.
- *The respondent.* With one exception: `reference/respondent-questions.md` exists so an author
  has something to forward when a respondent writes to them. Everything else addresses the author.

---

## 2. Voice

Second person, present tense, active. You are talking to one person while they have the screen open.

Say *Open the Distribute tab*, not *the Distribute tab should be opened*. Say *MJ Forms saves the
answers first*, not *the answers will have been saved*.

Four habits worth naming, because they creep in:

- *No hedging.* Not *you may wish to consider*. Either tell them to do it or leave it out.
- *No future tense for present facts.* The button does not *will appear*. It appears.
- *No apology, no delight.* Not *unfortunately*, not *simply*, not *just*, not *easy*. If it were
  easy they would not be reading this.
- *Name the thing.* Write *MJ Forms* or *the form*, never *the system* or *the platform*.

---

## 3. Titles

Verb-first, and phrased the way someone would search for it.

| Write | Not |
|---|---|
| Create a share link | Share links |
| Score answers | Scoring |
| Why a link is not working | Troubleshooting link issues |

A reference page that is not a task may be a noun — *Glossary*, *The 25 question types*. Everything
else starts with a verb.

---

## 4. One article, one task

An article finishes one job completely, then stops. If you find yourself writing *first you will
need to set up X*, X is a different article: link to it from `## Before you start`.

Two articles must never explain the same thing. A term or a concept is defined once, in
`reference/glossary.md`, and linked from everywhere else. The second explanation is the one that
goes stale.

---

## 5. The skeleton

Every task article uses this shape. Copy it.

````markdown
# Verb-first title

One sentence saying what the reader will have when they are finished.

## Before you start

- What must already be true, one bullet each, each one linked if it is its own article.
- Delete this section rather than padding it if nothing must be true.

## Steps

1. One action per step, starting with the verb.
2. Say where the thing is before you say to click it.
3. Stop at the point the task is done.

## What happens next

What changed, where the reader can see that it changed, and what to expect from it.

## Related

- [The next thing they will want](../section/article.md)
````

Rules about the shape:

- `## Steps` can carry a more specific heading — *Add a question*, *Publish the form*. What it may
  not be is two headings; a task article has one run of numbered steps.
- `## What happens next` is not a summary. It is the answer to *did that work?* — the state the
  reader can now observe.
- `## Related` is two to four links, not a dump.
- A reference page (the glossary, the question-type list) is exempt from the skeleton. It still gets
  the one-sentence opening.

---

## 6. Bold means it is on the screen

*This is the rule that matters most, and the one most easily broken by accident. Note that this
sentence is italic, not bold — the constraint applies to this page too.*

> Bold is reserved for text that appears on screen in the product. Emphasis uses *italics*. Nothing
> else may be bold.

So: *Open the* **Distribute** *tab and choose* **Create a share link**. The tab and the button are
bold because those words are painted on the reader's screen. The word *Distribute* used as a verb,
and every word you want to lean on, is italic.

### Why the rule exists

Help documentation does not fail on the day it ships. It fails eighteen months later, when somebody
renames a button and nobody remembers that four articles quoted the old name. The reader is then
looking for a control that does not exist, and there is no way to find that out except by reading
every article against the product.

Prose cannot be checked by a machine. A quoted label *can* — if a machine can tell which words are
quoted labels. Bold is that marker, and this rule is what makes it reliable.

### What the gate actually does

`scripts/check-help-docs.mjs` takes every bold span in `docs/help/**/*.md`, concatenates every `.ts`
and `.html` file under `packages/Angular/src`, `packages/Server/src` and `packages/Entities/src` into
one haystack, and fails if a span is neither a substring of that haystack nor listed in
`.ui-strings-allow.txt`. It prints `file:line` for every failure.

Entities is in the list because a lot of what a *respondent* reads lives there rather than in a
template: the confirmation after submitting, every validation message, the starter template names.

Both sides are whitespace-normalised before the comparison — every run of spaces, tabs and newlines
collapses to one space. A long label wraps across two lines in the source, and a long bold span
wraps across two lines in your paragraph; neither wrap should read as a renamed button. Everything
else is exact, including punctuation and capitals.

*Renaming a button therefore turns the build red on the pull request that renames it.* That is the
feature, not a bug. The person doing the rename gets a list of every article that quotes the old
name, at the moment they can still fix it cheaply, instead of leaving it for a reader to discover.

### What this means while you write

- Never bold for emphasis. Not once. Italics exist.
- Never bold a paraphrase. `**the publish button**` fails the gate; **Publish** passes it.
- Copy labels; do not recall them. Read them out of the three source roots above — respondent-facing
  wording usually lives in `packages/Entities/src/contracts/` — or out of the extracted copy your
  task brief points you at. A label you are confident about is exactly the kind that is wrong.
- The match is case-sensitive, so capitals and punctuation are exact; only spacing is forgiving.
  Watch for curly apostrophes — the product uses them. Prefer a label without one.
- A one-word label is only weakly checked, and it is worth knowing why. *The haystack is the
  product's source code, not a list of its labels* — 338 files, every one of them shipped, with the
  230 test files excluded so that a leftover string in an old assertion can never stand in for a
  button. What it still cannot tell apart is a label from an identifier or a code comment in the
  same file. So **Next** matches a variable named `nextQuestion` as happily as it matches the
  button: the word occurs 43 times, and renaming the button would leave the gate green. Multi-word
  labels occur once or twice — **Save progress here** and **Require a captcha** occur exactly once
  each — so those are checked properly. Quote the whole label wherever the product gives you one.
- Do not bold inside a heading. Write the label in plain words there.
- *A tooltip is on screen only while somebody is hovering, so bold one only in an article that tells
  the reader to hover.* [Publish a form](share/publish.md) does exactly that — it says the full
  sentence appears on hover, then quotes all four — and that instruction is what makes the bold
  true. Bolded without it, a tooltip is a claim about text the reader is not looking at, and the
  gate cannot tell the two cases apart: the string is in the source either way.
- Bad examples belong in fenced or inline code. The gate skips both, which is why the wrong example
  two bullets above could be written at all. Use that escape hatch for anything you are quoting *as*
  broken.
- *A string in backticks or a fence is exempt from the gate, so check it against the source by hand
  — every time.* The exemption is about what gets rendered, not about how sure you are, and it
  inverts the pressure in the direction nobody expects: a reorder banner quoted in
  `build/add-and-arrange-questions.md` sat inside backticks and therefore got *less* scrutiny than
  the labels around it, not more, and one of the sentences was one the product never produces. Read
  a fenced quotation out of the three source roots exactly as you would read a bold span.
- The gate skips HTML comments for the same reason it skips code: nothing inside one is rendered, so
  nothing inside one is a claim about the product. That is not a loophole to bold through — it is
  how `_sidebar.md` and `README.md` park the articles that have not been written yet.
- This page and `reference/glossary.md` obey the rule too. The gate reads them like any other file.

### The allowlist, and how to not ruin this

Some on-screen text is composed while the form runs — a page heading numbered from a count, a
message assembled from parts — and some comes from MemberJunction itself rather than this
repository. That text exists on screen but cannot be found in this repository's source. It goes in
`docs/help/.ui-strings-allow.txt`, one entry per line, each with a `#` comment giving the reason.

The allowlist is for text that is genuinely not in the source. It is not for text that *used to be*
in the source. Silencing a real failure by adding the old label to the allowlist is precisely how
this rule stops working, and it will not be noticed for a year. If the gate says a label is missing,
your first assumption is that the label changed.

---

## 7. Words

Plain ones. If a shorter word does the job, it is the right word.

Never use the vocabulary the software uses about itself. The reader has never heard it and does not
need to.

| Do not write | Write |
|---|---|
| entity, table, row, field | record |
| distribution, magic link, token | share link |
| snapshot, FormVersion | published version |
| endpoint, API, payload, resolver | rewrite the sentence |
| the system, the platform | MJ Forms, or the form |
| utilise, leverage, facilitate | use, help |
| in order to | to |

Some words *are* the reader's, because the product puts them on screen: *respondent*, *section*,
*validation*, *insights*, *template*. Those are fine. Define each one in the glossary the first time
the help centre needs it, and link to the definition rather than re-explaining it.

Numbers, dates and counts follow the product. When you quote a label, quote it exactly — including
British spellings such as *colour* and *centre*, which the product uses in places. Outside a quoted
label, do not agonise about spelling: neither variety is enforced here, but be consistent inside one
article.

---

## 8. Links

Internal links are written as they sit on disk, relative to the article you are writing:

````markdown
See [the glossary](../reference/glossary.md).
````

That exact form works on the rendered site, in an editor, and on github.com if the site is ever
unavailable, and it is the form the gate resolves. Always include the `.md`.

`_sidebar.md` and `_navbar.md` are the two exceptions: their links start with `/` because they are
rendered on every page, from every folder. Leave them that way.

The gate fails on a link whose target does not exist on disk, and on an image that does not resolve.
It skips a link to another site, which nothing here can check, and — as in §6 — anything inside code
or an HTML comment.

One kind of absolute link is *not* skipped: a GitHub URL into this repository's own files
(`https://github.com/MemberJunction/bizapps-forms/blob/main/docs/install.md`) is resolved from the
repository root and checked like any other. That is how to link a file that lives outside
`docs/help/` — a relative path out of the site is one the site would try to open as an article —
and it means a file renamed by a release fails the gate here rather than 404ing for a reader.

Every new article must be added to `_sidebar.md`. The gate checks this; an article nobody can
navigate to is an article nobody reads.

There is no exemption from either half, for any file. So the commit that adds an article is also the
commit that links it: from `_sidebar.md` always, and from `README.md` and any `## Related` list that
should point at it. Until then its line waits in the comment at the foot of `_sidebar.md`. A
navigation entry leading nowhere is the worst dead link a help centre can have, which is exactly why
the file holding the navigation does not get to skip the check.

---

## 9. Screenshots

The help-writing advice you will find elsewhere says to illustrate every complex step. Taken
literally across 29 articles that is about seventy images, each one pinned to the position of a
control, each one wrong the first time a panel moves.

We do the opposite. About fifteen *orientation* images, roughly one per major surface, each
answering *where am I and what am I looking at*. That is the question a first-time reader actually
has, it is the question prose answers worst, and a surface outlives a button's position by years.

- One image per surface, near the top of the article that introduces it. Not one per step.
- Alt text describes the surface and what it is for, not the pixels.
- No arrows, no callout numbers, no red circles. They rot faster than the screenshot does.
- *No screenshot may contain a real person's data.* The development database holds real-looking
  respondents, and the response, insight and respondent views display them. Every image comes from
  the fabricated demo form, captured by `scripts/capture-help-screenshots.mjs`, so it can be
  regenerated rather than re-staged by hand.
- Images live in `docs/help/images/`.

---

## 10. Never promise what has not shipped

Not one sentence about a feature that does not exist today, in any tense. No *coming soon*, no *in a
future release*, no *not yet supported, but*.

At the time of writing, these do not exist and must not be implied: review or approval before
publishing, a payment question type, projecting responses into a queryable view, AI answer scores
shown in the interface, calculated fields, quotas beyond a simple response limit, and resuming a
half-finished response by email on another device.

That list lives in exactly one article,
[What MJ Forms cannot do yet](reference/not-yet.md), so that it can be checked in one
place when something does ship. If a reader is going to go looking for a missing feature, say so
there, plainly, and say what to do instead.

---

## 11. Before you push

```bash
npm run lint:help
```

Then read your article on the rendered site, at phone width, having forgotten that you wrote it.
