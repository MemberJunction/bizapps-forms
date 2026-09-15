# Share a QR code

A square you can put on a poster, a table card or a slide, which opens your form when somebody points
a phone camera at it.

![The QR code view of a share link: the code itself, the button that downloads it for print, and a
note about where the code will and will not work.](../images/distribute-qr.png)

## Before you start

- A share link: [Create a share link](share-link.md). The code is a picture of that link's address,
  so everything that governs the link governs the code.

## Download the code

1. Open the **Distribute** tab and choose the link in the list on the left.
2. Press **QR code**, the middle of the three buttons above the panel. The code appears, with the
   line **Point a phone camera at this to open the form. It downloads as a vector file, so it stays
   sharp at any print size.**
3. Press **Download the QR code**. The file lands in your downloads, named after the link.
4. Hand it to whoever is making the poster. It is a vector file — an `.svg` — which means it can be
   scaled to a business card or a pull-up banner without going fuzzy, and a designer can drop it
   straight into their layout. If somebody asks you for a PNG at a particular size, they can make one
   from this.
5. Scan it with your own phone before it goes to print. A code that was never tested and a code that
   does not work look identical on the page.

## The two warnings

*The address points at this computer.* A code built while MJ Forms is running on somebody's own
machine encodes an address beginning `localhost`, which to a phone means the phone itself — so
scanning it finds nothing. A notice appears beside the code saying exactly that, and ending: **The
code is fine; the address is only reachable on this computer. It will work once the form is on a
real server.** Ask whoever looks after your system for the real address before you print anything.

*The address is too long to encode.* A QR code holds only so many characters. Where the code would
have been, MJ Forms puts a line instead: **This link is too long to fit in a QR code. Share the link
itself instead.** There is nothing to download in that case, and the link itself works normally.

## What happens next

The code and the link are the same address, so everything you do to the link happens to the code
too. Pausing the link stops the code working. A response limit or an expiry stops it on the same
terms. All of that is in [Set limits and dates](limits-and-dates.md) and
[Why a link is not working](why-a-link-is-not-working.md).

Two consequences worth knowing before a print run:

- Replacing a leaked credential with **Reissue link** keeps the web address, so printed codes keep
  working. That is the whole reason to prefer it over making a new link.
- Deleting the link kills every code already printed from it, and nothing you can do afterwards will
  revive them.

## Related

- [Create a share link](share-link.md) — the link behind the code, and how to reissue rather than
  replace it.
- [Set limits and dates](limits-and-dates.md) — what happens to a printed code when the link closes.
- [Why a link is not working](why-a-link-is-not-working.md) — for when the code scans and the form
  does not open.
