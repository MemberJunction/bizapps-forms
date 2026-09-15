# Brand a form

A form that looks like it came from you — your logo, your typeface, your colours — with the real
form beside the controls showing each change as you make it.

![The Design tab: the styling controls down the left, grouped under a logo, font, button and
background heading, and the form itself filling the rest of the screen, restyled as you
go.](../images/design-tab.png)

## Before you start

- A form with at least one question in it. With none, the panel beside the controls says
  **Add a question to see this form.** and there is nothing to style:
  [Add and arrange questions](../build/add-and-arrange-questions.md).
- If your logo lives on your website rather than on your computer, have its web address to hand.
  You can paste a link instead of uploading a file.

Everything here belongs to this one form. Restyling a form never changes the look of any other form,
so there is nothing to copy first and nothing you can break for a colleague.

## Brand the form

1. Open the **Design** tab. The controls are down the left; the form itself is on the right, and it
   is the real form rather than a sample, so what you see is what a respondent gets.
2. Four tabs run across the top of the controls: **Logo**, **Font**, **Buttons** and **Background**.
   The one that opens is **Font**, not the first in the row — press **Logo** if that is where you
   want to start.
3. Under **Logo**, press the button reading **Image**. A window opens where you can drag a file onto
   **Upload or drop an image here**, press it to browse, or paste a web address into
   **Paste an image link** and press **Add**. The logo appears above the form. The hint says what it
   is for: **Shown above the form. Leave empty for no logo.**
4. Once an image is set, the two buttons beside it are **Replace** and **Remove**. If its address
   stops working, this tab says **That image could not be loaded. Check the link.** — and on the
   form itself a respondent sees nothing at all in that space rather than a broken picture, so an
   image that quietly dies is worth checking for.
5. Under **Font**, choose from **System**, **Inter**, **Sora**, **Nunito** and
   **Fraunces (serif)**. **System** uses whatever typeface the respondent's own device prefers,
   which is the fastest to load and the least like anybody's brand.
6. Still under **Font**, **Color** has one row, **Titles and questions**. That is the colour of the
   words a respondent reads.
7. Under **Size and positioning**, the first row — **Welcome screen and endings** — sets the size and
   alignment of the big titles, and the second — **Questions** — does the same for each question.
   Sizes are **Sm**, **Md** and **Lg**; the two buttons beside them put the text on the left or in
   the centre.
8. Under **Buttons**, **Color** has three rows: **Buttons** is the colour of the button itself,
   **Button text** the words on it, and **Answers** the boxes and options a respondent fills in.
   **Corner radius** below offers three shapes — square, softly rounded, or fully round.
9. Under **Background**, **Color** sets the page behind the form, and **Background image** takes a
   picture the same way the logo does: **Covers the page behind the form. Leave empty for none.**

## Choosing a colour

Pressing a colour opens a picker: a square to drag in, a hue bar, a box you can type a code such as
`#1a1d21` into, and a row of suggested colours to pick from.

*Write down the code you are replacing before you type over it.* There is no reset, no undo and no
list of defaults anywhere on this tab, so the only record of the colour you started with is the one
you make yourself. The box in the picker shows the current code — copy it somewhere first.

Two of the rows are checked against what sits behind them: **Titles and questions** against the
background, and **Button text** against the button colour. When a pairing is too faint to read, the
picker says so with the real figure, not an adjective:

```
2.1:1 — hard to read. AA needs 4.5:1.
```

Heed it. It is the number an accessibility audit will hand you later, and a respondent reading your
form on a phone in daylight is the person it is about. Nothing stops you saving the colour anyway —
the warning is the only thing standing between that pairing and your respondents.

## What happens next

Below the controls, a line reports what MJ Forms has done with your changes. It reads **Saving…**
while it writes, then **Saved · publish to put it live**, and **Could not save — see logs** if the
write is refused.

That middle message is the important one. *Saved* means the design is stored on the form. It does
not mean anybody can see it: everyone holding your link keeps getting the version you last
published, in the colours it had then, until you publish again.

So the order is: style it here, check it at phone width, publish.

## Related

- [Preview on phone and tablet](preview.md) — the same form at 393 pixels wide, which is where a
  background image and a large title cost the most.
- [Publish a form](../share/publish.md) — what publishing takes a copy of, and why nothing you did
  here reaches anyone until you press it.
- [Add sections and screens](../build/sections-and-screens.md) — the welcome screen and endings
  whose titles the size and alignment controls govern.
