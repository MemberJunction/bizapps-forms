# Require a captcha

Ask each respondent to prove they are a person before their answers are accepted — and check one
thing with whoever looks after your system before you switch it on.

*Turning this on when the server has no Cloudflare Turnstile keys takes your form offline.* Every
submission through the link is refused, the respondent is told the form cannot be submitted, and
nothing on the **Distribute** tab warns you beforehand. There is no way to tell from the builder
whether the keys exist. So ask first, and if the answer is no, leave the switch alone until it is
yes.

## Before you start

- Confirmation from whoever installed MJ Forms that Cloudflare Turnstile keys are configured on the
  server. That is their job, not yours, and it is described in
  [the installation guide](https://github.com/MemberJunction/bizapps-forms/blob/main/docs/install.md).
- A share link: [Create a share link](share-link.md). The setting belongs to one link, so you can
  require a check on the link you posted publicly and not on the one you emailed to forty named
  people.

## Turn it on

1. Open the **Distribute** tab, choose the link, and scroll to **Settings**.
2. Find **Require a captcha**. Its hint states both halves — what it does and what it costs:
   **Ask each respondent to pass a Cloudflare Turnstile check before submitting. This needs
   Turnstile keys configured on the server — without them, every submission through this link is
   refused.**
3. Turn the switch on.
4. Open the link yourself and submit a test answer. This is not optional. It is the only check that
   distinguishes a working captcha from a form nobody can submit, and it takes a minute.

## What the respondent sees

With keys configured, a small challenge appears under the last question. Most people pass it without
doing anything — they tick a box at most. Then they submit as normal.

Two things can go wrong for them, and both say so plainly:

- Pressing **Submit** before the challenge has passed gives **Please complete the security challenge
  before submitting.**
- A challenge that cannot load gives **The security challenge could not be loaded. Please refresh and
  try again.** — a network or blocking problem at their end, and refreshing usually settles it.

Without keys configured, there is no challenge to pass. In its place the respondent reads
**This form requires a security challenge, but it has not been configured yet. It can't be submitted
until the site owner adds a Turnstile site key.**

The form cannot be submitted at all. Everything they typed is on the screen and there is no way to
send it, and the *site owner* in that sentence is you.

## If you have already done it

Turn **Require a captcha** off. The link accepts submissions again immediately — there is nothing to
publish and nothing else to change.

Then assume you lost the people who tried in the meantime. They were told the form was not
configured, which reads as your mistake rather than a temporary one, and none of them will come back
on their own. Send the link again and say it is working now.

## What happens next

While the switch is on, every submission through this link carries a passed challenge. Nothing else
about the form changes: the same questions, the same published version, the same count against a
response limit.

If a form is being filled in by a script rather than by people, a captcha is one answer and a
response limit is another, and they work together — see
[Set limits and dates](limits-and-dates.md).

## Related

- [Set limits and dates](limits-and-dates.md) — the other settings on the same list, and what a
  respondent sees when one of them stops the link.
- [Why a link is not working](why-a-link-is-not-working.md) — for a link that looks **Live** while
  every submission is being refused.
- [Create a share link](share-link.md) — a second link, without the check, for an audience you
  already trust.
