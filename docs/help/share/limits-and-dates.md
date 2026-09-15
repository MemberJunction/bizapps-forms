# Set limits and dates

A link that stops taking answers when you have enough of them, or when your deadline passes, without
you having to remember to go and close it.

## Before you start

- A share link: [Create a share link](share-link.md). All three settings belong to one link, not to
  the form. Two links to the same form can have different limits, different dates and different
  counts — one for the poster capped at fifty, one for the mailing list with no cap at all.

## Set them

1. Open the **Distribute** tab, choose the link in the list on the left, and scroll down to
   **Settings**.
2. **Open to responses** is the switch that closes a link by hand, for a form you want to stop now
   and perhaps reopen later. Its hint: **Turn off to stop taking responses and withdraw this link's
   access token. The web address never changes, so anything already printed works again the moment
   you turn it back on.** Turning it off puts the link into **Paused**.
3. **Response limit** takes a number: **Stop after this many responses. Empty means no limit.** The
   box shows **No limit** until you type one. Once there is a limit, a count and a bar appear beside
   it — `12 of 50` — so you can see how close it is without counting. At the limit the link's badge
   becomes **Limit reached**.
4. **Expires** takes a date and a time: **Stop taking responses after this date. Empty means it
   never expires.** Before the date, the line under the badge tells you when it goes — `It expires
   on …`. After it, the badge reads **Finished**.
5. Each one saves when you leave the box. There is nothing else to press, and nothing to publish —
   these are settings on a link, not part of the form, so they take effect at once.

There is no control here for a *start* date. If a link has one from somewhere else it shows the badge
**Scheduled**, and the button beside it, **Open it now**, clears the date and opens the link
immediately.

## What a respondent sees when it stops

They do not get a broken page or an error. They get a plain sentence, and which sentence depends on
why the link stopped:

| The link reads | The respondent gets |
|---|---|
| **Paused** | **This form is no longer accepting responses.** |
| **Finished** | **This form is no longer accepting responses.** |
| **Limit reached** | **This form has reached its response limit and is no longer accepting responses.** |
| **Scheduled** | **This form isn't open yet.** followed by the date it opens, or, when there is no date to give them, **This form isn't open yet. Please check back later.** |

In every one of those cases they cannot answer, so the only question is which sentence you would
rather they read. *Reached its response limit* tells somebody they were late rather than that
something is broken, which is worth having when the link is on a poster that stays up for another
fortnight.

Somebody already part-way through when the limit fills is refused at the moment they press
**Submit**, with a banner reading **This form is no longer accepting responses (quota reached).**
Their answers stay on the screen, so nothing they typed is lost to them — but none of it reaches
you. If those last few responses matter, raise the limit before it fills rather than after.

## What happens next

The badge beside the link's name is the truth about it at any moment, and it changes on its own as a
date passes or a count fills. Every one of these states has a one-press way out, listed in
[Why a link is not working](why-a-link-is-not-working.md) — **Remove the limit**,
**Remove the expiry**, **Turn it back on**.

Raising a limit or pushing back an expiry reopens the link at the same web address, so anything
printed starts working again.

## Related

- [Why a link is not working](why-a-link-is-not-working.md) — every state a link can be in, and the
  button that fixes it.
- [Create a share link](share-link.md) — making a second link so that two audiences can have
  different limits.
- [Require a captcha](captcha.md) — the other setting in this list, and the one worth reading before
  you touch it.
