-- Retire the credentials that were minted before a link could lose one.
--
-- The lifecycle hook shipped alongside this restores the invariant on every SAVE of a
-- distribution — but nobody saves a link they closed last month, which is exactly the
-- population the invariant is about. Without this, every already-paused, already-closed
-- and never-published link on an existing install keeps a redeemable `Active` invite until
-- something happens to touch its row, and the headline of bizapps-forms#104 stays true for
-- the whole existing corpus while being false for everything created afterwards.
--
-- No schema change: two guarded UPDATEs, both idempotent, both no-ops on a database that has
-- nothing to fix (the development database this was authored against matches 0 rows).
--
-- Deliberately NOT gated on ChannelType. The hook revokes an unlinkable channel's credential
-- too, but `FORMS_MAGICLINK_CHANNELS` is host configuration and this SQL cannot read it, so
-- this backfill takes only the half that is settled by data: a link that is not open for
-- responses has no business holding a live credential whatever channel it was created under.
-- The remaining case self-heals the next time such a record is saved.

-- 1. The credential itself. `Revoked` is MJ core's own terminal status for an invite that must
--    never be redeemed again — `evaluateInvite` rejects it ahead of every other check, and the
--    atomic consume UPDATE matches only `Status='Active'`. Restricting the WHERE to `Active`
--    keeps history honest: an invite already `Consumed` or `Expired` records how it ended, and
--    overwriting that with `Revoked` would claim an operator action that never happened.
UPDATE i
SET i.Status = 'Revoked'
FROM [${mjSchema}].[MagicLinkInvite] i
INNER JOIN [${flyway:defaultSchema}].[FormDistribution] d ON d.MagicLinkInviteID = i.ID
WHERE i.Status = 'Active'
  AND (d.Status <> 'Active' OR d.IsActive = 0);
GO

-- 2. The distribution's own copy of it. Both columns clear together, because they are one
--    value — see their descriptions, updated in the migration beside this one. Leaving the
--    token behind would leave `/f/:slug` handing a dead token to the redeem endpoint, and
--    leave the builder badging a link that has no working credential as though it had one.
--
--    Matched on the invite's status rather than re-deriving the distribution predicate from
--    step 1, so this cannot clear a credential step 1 did not actually revoke — including on
--    a re-run, where the rows step 1 has already handled are precisely the ones still needing
--    this half if it failed the first time.
UPDATE d
SET d.MagicLinkInviteID = NULL,
    d.PublicLinkToken = NULL
FROM [${flyway:defaultSchema}].[FormDistribution] d
INNER JOIN [${mjSchema}].[MagicLinkInvite] i ON i.ID = d.MagicLinkInviteID
WHERE i.Status = 'Revoked';
GO
