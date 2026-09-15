# Add sections and screens

A form the respondent moves through a page at a time, with something to read before the first
question and something to see after the last.

## Before you start

- A form with some questions in it. See
  [Add and arrange questions](add-and-arrange-questions.md).
- One idea, which the rest of this page builds on: *a section is a page*. The respondent sees one
  section at a time and presses **Next** to reach the following one. Splitting a form into sections
  is the only way to control how much of it arrives at once.

## Build the shape of the form

1. Press **Add a section**, under the last section on the canvas. A new empty page appears, saying
   **This section is empty. Add your first question here, or pick a type from the palette.**
2. Give the section a title by typing into the heading at the top of it. Left alone it is numbered
   — `Page 1`, `Page 2` — and respondents read that number as the page heading, so a real name is
   worth the ten seconds.
3. Add a sentence under the title if the page needs one. The box says
   **Add a short description for this section (optional)**, and the respondent reads it under the
   heading before the first question.
4. Turn on **Save progress here** on any section you want a half-finished response from. The hint
   says what it does: **Save a partial response as soon as the respondent moves past this page**.
   See below for what that means for you and for them.
5. Press **Add a welcome screen**, at the top of the canvas, if the form needs an introduction.
   Fill in **Title**, **Body** and **Button label** in the panel on the right; **Image** puts a
   picture above them. A form may have exactly one, and **Delete welcome screen** removes it.
6. Press **Add an ending**, under the **Endings** heading at the foot of the canvas, to write what
   people see after they submit. Give it a **Title** and a **Body**.
7. Press the same button again — it now reads **Add a conditional ending** — for each further
   ending you want. A second ending only earns its place if something sends people to it, which is
   the next section of this page.

## What a partial response means

**Save progress here** is the difference between knowing somebody started and knowing nothing at
all. With it on, the moment a respondent moves off that page their answers so far are stored as a
[partial response](../reference/glossary.md), which you can read like any other.

Two things follow that people are surprised by.

- The respondent is not told. There is no account, no email and no resume link — nothing about their
  half-finished answer is theirs to come back to. Closing the tab ends it. What you keep is a copy
  of what they had typed when they left.
- It is per section, not per form. Turn it on at the end of the first page and you learn who got
  past the questions everybody answers. Turn it on everywhere and you learn where people give up,
  which is usually the more useful thing.

## How a respondent reaches an ending

There are exactly three ways, and the short line above each ending's title on the canvas tells you
which one applies to it. This is the part of the page worth reading twice, because two of the six
labels say *never shown* and neither of them means anything is broken.

| The line reads | What it means |
|---|---|
| **Default ending** | Everyone who finishes lands here unless a rule sends them elsewhere. Exactly one ending is the default; turning on **Default ending** in the panel on the right moves it to whichever ending you are looking at. |
| **Conditional ending** | The ending carries a condition, and it is chosen when that condition matches. Endings are checked in order and the first match wins. |
| **Reached by a rule** | No condition of its own, but a **Then go to** rule somewhere on the form names it. See [Show, skip and branch](logic.md). |
| **Screened out** | The ending is marked **Screened out** *and* a rule points at it. Responses landing here are recorded as disqualified. |
| **Never shown — add a condition** | The ending has no condition and nothing points at it, and it is not the default — so nobody can ever get here. Give it a condition, or make it the default, or delete it. |
| **Never shown — no rule sends anyone here** | The same problem on a **Screened out** ending. These are never chosen by a condition, so a **Then go to** rule is the only way in and *add a condition* would be useless advice. |

Two settings on the panel change what arriving at an ending means, rather than who arrives.

- **Screened out** records the response as disqualified: the hint spells out the consequences —
  **Responses that reach this screen are recorded as disqualified — they do not count toward your
  response limit, and no automations run. Send people here with a Go to rule.** Use it for the
  people your form has decided are not eligible. The default ending cannot be screened out, because
  everyone who finishes normally lands there.
- **Redirect after submit** sends them to a web address of yours instead of showing the screen at
  all: **Send the respondent to another page instead of showing this screen.** An ending set up this
  way wears a **Redirect** badge on the canvas.

## What happens next

The canvas now reads top to bottom as the respondent's journey: the welcome screen, the sections in
order, then the endings. Press **Preview**, in the bar above the tabs, to walk it exactly as they
will, at desktop, tablet or phone width.

If you add no endings at all, nothing is broken — respondents get MJ Forms' own short confirmation
after they submit. An ending screen is how you replace that with something of your own.

## Related

- [Show, skip and branch](logic.md) — sending different people to different endings, and skipping
  whole sections.
- [Add and arrange questions](add-and-arrange-questions.md) — filling the pages you have just made.
- [Glossary](../reference/glossary.md) — *section*, *partial response*, *ending screen* and
  *welcome screen*, in the sense MJ Forms means them.
