# Embed in your own site

Your form inside a page of your own website, so people answer it without leaving your site — and the
one setting on this screen that can take it back off that page again.

![The embed view of a share link: the snippet to paste into your own page, and under it the box that
lists which websites are allowed to show the form.](../images/distribute-embed.png)

## Before you start

- A share link: [Create a share link](share-link.md). An embed is a view of a link, not a separate
  thing.
- Someone who can edit the HTML of the page it is going on. That may be you; if it is not, you are
  going to hand them the snippet and the address of the page.

## Copy the snippet

1. Open the **Distribute** tab and choose the link in the list on the left.
2. Press **Embed**, the third of the three buttons above the panel.
3. The box now holds the snippet — a short piece of HTML pointing at the same address the **Link**
   view gives you. Press **Copy snippet**; it changes to **Copied**.
4. Paste it into the page where the form should appear: **Paste this into your own page's HTML to
   show the form inside your site.**
5. Load the page and check the form appears. It takes the full width of whatever it is placed in and
   is about 600 pixels tall to begin with, and the form scrolls inside that space.

Nothing about an embedded form is different for the respondent. It is the same published version,
the same questions, the same limits and the same count.

## Sites allowed to show this form, and the trap in it

Under the snippet is a box labelled **Sites allowed to show this form**. Leave it empty and any site
may show your form inside its pages. That is the state every link starts in, and for most forms it
is the right one.

*Filling it in can stop a form that is already live on a page.* MJ Forms says so in the hint under
the box, and it is worth reading twice: **Once you list a site, only the sites you list can do that
— on any other page the form stops loading, including pages it is already on.** A form embedded in
three pages across two sites, with one of those sites typed into this box, goes blank on the other.

Two more things the hint tells you:

- **One address per line.** Each one is a site, written in full — `https://careers.acme.com`, with
  the `https://` and with or without the `www.` exactly as the page is served. `https://acme.com`
  and `https://www.acme.com` are two different sites to a browser, so list both if you use both. No
  page, no query, no `*`. Plain `http://` is accepted only for a test on your own machine.
- The box does not lock your form down: **This does not restrict the link itself: anyone who has
  this form's link can still open it on its own and answer, from anywhere.** If what you wanted was
  to stop people answering, the controls for that are **Open to responses**, **Response limit** and
  **Expires** — see [Set limits and dates](limits-and-dates.md).

The box saves when you click away from it. An address MJ Forms cannot use is refused with a message
naming it, and your text is left exactly as you typed it so you can fix it.

## What happens next

Load the page in a browser you are not signed in to — a private window is enough — and answer the
form. It behaves as it does anywhere else, and the response appears on the **Responses** tab like
any other.

If the form is missing from the page, the likeliest cause is the box above: the page's own address is
not one of the ones listed. Add it, or empty the box.

## Related

- [Create a share link](share-link.md) — the link the snippet points at, and the settings it carries.
- [Why a link is not working](why-a-link-is-not-working.md) — including the case where the link opens
  on its own but the embedded copy does not.
- [Set limits and dates](limits-and-dates.md) — the controls that actually stop a form being
  answered.
