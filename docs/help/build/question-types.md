# The 25 question types

Every type MJ Forms can ask a question in, what each one collects, and the one you want.

The types live in the palette down the left of the **Build** tab, under seven headings, and in the
**Insert a question** dialog when you add a question between two others. The search box above the
palette, **Search form elements**, matches the description as well as the name — type *consent* and
you get **Checkbox**, type *url* and you get **Website** — so you can find a type without already
knowing what it is called.

Each entry below quotes the description the palette shows you, then says when to reach for it. If
two look interchangeable, the difference is usually what the answer is *worth to you afterwards*.
An answer somebody picked from a list can be counted and charted; an answer somebody typed has to
be read.

Picking a type is not a one-way door — until you publish. Changing a question's type after
responses are in changes what a stored answer means, so decide before you send the link out.

## Contact

Five ways to collect who somebody is and how to reach them.

| Type | What it collects, and when to use it |
|---|---|
| **Contact info** | **Name, email, phone and company in one block** — one question that draws five boxes. Use it as the opener on almost any form: it is faster to add than four separate questions and it reads as one thing to the respondent. |
| **Email** | **An email address, format-checked** — use it when an address is all you need, and you want MJ Forms to reject *bob@* before it reaches you. |
| **Phone number** | **A phone number, format-checked** — use it when somebody will be rung. On a phone it brings up the number keypad. |
| **Address** | **Street, city, region, postal code and country** — use it for a delivery, a visit or a constituency. Do not use it when a postcode alone would do; five boxes is a lot to ask for one fact. |
| **Website** | **A web address** — use it for a company site, a portfolio or a social profile. |

## Text

Three ways to let somebody write or count.

| Type | What it collects, and when to use it |
|---|---|
| **Short text** | **One line of free text** — use it for a job title, a reference number, a team name: anything that fits on a line. |
| **Long text** | **A paragraph of free text** — use it for the question whose answer you actually want to read. **Height (rows)** sets how tall the box starts, so a four-line box invites four lines. |
| **Number** | **A numeric answer** — use it for a quantity, an age or a budget. It is the only text-ish type you can set **Minimum value** and **Maximum value** on: see [Require and check answers](required-and-validation.md). |

## Choice

Seven ways to offer somebody a set of answers. These are the types worth reaching for whenever you
can, because an answer somebody picked is an answer you can count, chart and branch on; an answer
somebody typed is 200 spellings of the same word.

| Type | What it collects, and when to use it |
|---|---|
| **Multiple choice** | **Pick one option** — the everyday radio-button question, and the default choice type. A new one arrives with two options already in it, ready to be renamed. |
| **Checkboxes** | **Pick any number of options** — use it for *tick all that apply*. The answer is a list, so the operators that read it are **includes any of** and **includes none of** rather than **equals**. |
| **Dropdown** | **Pick one from a long list** — the same job as **Multiple choice**, folded into a menu. Use it past about eight options, where a column of radio buttons stops being readable on a phone. |
| **Picture choice** | **Pick one option shown as an image** — use it when the options are things to look at: a venue, a layout, a colourway. Each option carries an image as well as a label. |
| **Yes / No** | **A two-way answer** — use it for the question that genuinely has two answers. Two options you would have had to write yourself, already written. |
| **Checkbox** | **A single box to tick — consent, opt-in** — one box, not a set. **Checkbox label** is the text beside the box; the question itself stays above it. Use it for a mailing-list opt-in. |
| **Legal** | **Terms to read, then accept or decline** — use it when somebody has to agree to something you must be able to prove they saw. **Terms** holds the text, shown in a scrollable box above the two buttons. |

## Scale

Five ways to ask how much, how good, or in what order.

| Type | What it collects, and when to use it |
|---|---|
| **Net promoter score** | **The 0–10 recommendation question** — the standard *how likely are you to recommend us*. Use it when you want a number you can compare with everyone else's. |
| **Opinion scale** | **A numbered scale with a label at each end** — use it when NPS is the wrong question but a scale is the right shape. **Lowest value**, **Highest value**, **Label at the low end** and **Label at the high end** are yours to set. |
| **Rating** | **Stars, out of a configurable maximum** — use it where stars are what people expect. **Number of stars** defaults to 5. |
| **Ranking** | **Put options in order of preference** — use it when *which is best* is less useful than *in what order*. Every option ends up in the answer, so a rule asking whether it includes something is true for anyone who answered at all. |
| **Matrix** | **A grid — one answer per row** — use it to ask the same scale about several things at once. You write **Rows** and **Columns** separately; each row takes one answer. |

## Date

| Type | What it collects, and when to use it |
|---|---|
| **Date** | **A calendar date** — use it for a birthday, a deadline or a preferred day. It opens the phone's date picker rather than a text box. |
| **Time** | **A time of day** — use it for an arrival or a preferred slot. Two questions, a **Date** and a **Time**, is how you ask for a moment. |

## Upload

| Type | What it collects, and when to use it |
|---|---|
| **File upload** | **A file the respondent attaches** — use it for a CV, a photograph or a document. **Accepted file types** narrows what the picker offers; leave it blank to allow anything. |
| **Doodle** | **A freehand drawing or sketch made on screen, stored as an image** — use it for a signature, a sketch or a mark on a diagram. It saves as an image, so it lands with the uploads. |

## Structure

| Type | What it collects, and when to use it |
|---|---|
| **Statement** | **Text shown to the respondent — collects no answer** — use it to explain a section, set out a condition, or break up a long form. Because it collects nothing, no rule can branch on it and it never appears in the export. |

## What each type brings with it

The type decides more than the box on screen. Three things follow from it, and they are the usual
reason to change your mind about which one to use.

- **Answer validation** offers different fields per type. Length for text, range for numbers and
  scales, a pattern for text — and nothing at all for several types, which say
  **No validation options for this question type.** See
  [Require and check answers](required-and-validation.md).
- **Scoring** appears only on the five types whose answers you wrote: **Multiple choice**,
  **Checkboxes**, **Dropdown**, **Picture choice** and **Ranking**. Points attach to options, so a
  type without options has nothing to attach them to. See [Score answers](scoring.md).
- **Logic** offers different comparisons per type. A scale can be *greater than*; a typed answer
  cannot, because comparing two arbitrary sentences is not a question anyone meant to ask. See
  [Show, skip and branch](logic.md).

## Related

- [Add and arrange questions](add-and-arrange-questions.md) — getting one of these onto the page,
  and into the right place.
- [Require and check answers](required-and-validation.md) — making an answer compulsory, and
  rejecting one that is the wrong shape.
- [Score answers](scoring.md) — points per option, and routing by the total.
- [What MJ Forms cannot do yet](../reference/not-yet.md) — for the type that is not on this list, a
  payment question among them, and for a question whose answer you wanted worked out from the
  others.
