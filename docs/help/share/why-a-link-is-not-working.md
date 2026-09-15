# Why a link is not working

Somebody has told you your link does not work. This page finds out why in about thirty seconds, from
the one badge that already knows.

## Start with the badge

Open the **Distribute** tab and choose the link in the list on the left. Beside its name is a badge
in one of six states, and under the badge is a sentence saying what a respondent opening that link
right now would get. The same state appears under the name in the list, next to the response count,
so a form with several links shows you all of them at once.

The badge is not a copy of a setting you made. It is MJ Forms asking the same questions the server
asks before it accepts a submission, so a link that reads **Live** really is taking answers, and one
that does not tells you which of the six reasons applies.

Every state that is not **Live** carries its own fix, as a button immediately to the right of the
badge.

## The six states

| Badge | What MJ Forms says about it | The button beside it |
|---|---|---|
| **Not ready** | **This link has no web address yet, so it will not open. Issue it to fix that.** | **Issue the link** |
| **Paused** | **Turned off.** Anyone opening it is told the form is not taking responses. | **Turn it back on** |
| **Scheduled** | **Waiting for its start date. Until then it turns people away.** | **Open it now** |
| **Live** | **Anyone with this link can open the form and answer it. No sign-in needed.** | None. This is the one you want. |
| **Finished** | **It passed its expiry date, so it has stopped taking responses.** | **Remove the expiry** |
| **Limit reached** | **It has collected every response you allowed.** | **Remove the limit** |

Three notes on that table.

*Pressing the fix does the whole thing.* **Remove the expiry** clears the date; **Remove the limit**
clears the number; **Turn it back on** reopens the link and issues it a fresh credential at the same
web address. There is nothing to publish afterwards — a link's settings are not part of the form, so
they take effect the moment you press.

*A paused link says more than the table has room for.* The full sentence adds that the link holds no
working access token while it is off, and that turning it back on issues a fresh one at the same web
address. Occasionally it says something else again: when the record still carries a token, MJ Forms
declines to claim the token was withdrawn and tells you the withdrawal is not confirmed. Treat the
old address as possibly still working until that clears, and if it matters, replace the credential
with **Reissue link** — see [Create a share link](share-link.md).

*Not ready is the only one that is not your doing.* It means the server never handed this link a web
address. Press **Issue the link** once; if that fails, the message that comes back is the one to
forward: **The server did not hand out a web address for this link. Public links are not switched on
for this server — someone technical needs to enable magic links before any share link here will
work.** Nothing you can do on this tab fixes that.

## Start from the symptom

*Nobody can open it, and the form is new.* Look at the publish control in the bar above the tabs
before you look at anything else. Two signs that the form was never published: the control reads
**Published, not shared**, or your respondents are reading **This form hasn't been published yet. If
you were sent this link, its author still needs to publish the form.** Either way the cure is
[Publish a form](publish.md).

*It worked last week and does not now.* Read the badge. **Finished**, **Limit reached** and
**Paused** all look identical from the outside, and all three are one press from working again.
[Set limits and dates](limits-and-dates.md) has what a respondent sees in each case.

*It turns people away and I never set a start date.* That is **Scheduled**, from a date that arrived
from somewhere other than this tab. **Open it now** clears it.

*They can open the form, fill it in, and then it refuses to submit.* The link is **Live** — the
refusal is at the end, not the start. The usual cause is a captcha switched on for a server with no
keys, which refuses every submission and says so where the challenge should be:
[Require a captcha](captcha.md). The other cause is a response limit that filled while they were
typing: [Set limits and dates](limits-and-dates.md).

*It opens on its own but not inside our own web page.* The link is fine and the embed is not. Check
**Sites allowed to show this form** on the **Embed** view: once any site is listed, the form stops
loading on every page that is not in the list, including pages it was already on —
[Embed in your own site](embed.md).

*The QR code scans and nothing opens.* The code encodes whatever address the link had when it was
made. If that address was only reachable on the computer the form was built on, no phone will ever
open it — [Share a QR code](qr-code.md).

*They get a message saying the link was not found.* **This form link was not found. Please check the
link and try again.** means there is no such link: it was deleted, or the address lost characters on
its way through an email or a chat message. Send the address again from **Copy link**, and if it was
deleted, make a new link — a deleted one cannot be brought back.

*Several people in one building are being turned away.* **Too many attempts from this network.** is
a limit on how often one internet connection may open forms, and an office, a school or a conference
is one connection as far as it is concerned. The message names how long the wait is, and it clears
itself; tell them to wait it out rather than keep refreshing, which only spends the budget again.

*I fixed it — do I need to publish?* No. Everything on this page is a setting on a link and takes
effect at once. Publishing is only for changes to the form itself: [Publish a form](publish.md).

## What happens next

Press **Open it yourself** on the **Link** view and answer your own form to the end. A badge reading
**Live** and a submission that actually lands are two different claims, and only the second one is
the one your respondents care about.

## Related

- [Create a share link](share-link.md) — making, naming, reissuing and deleting a link.
- [Set limits and dates](limits-and-dates.md) — the three settings behind **Paused**, **Finished**
  and **Limit reached**.
- [Publish a form](publish.md) — the other half of "nobody can open it", and the one this page
  cannot fix.
