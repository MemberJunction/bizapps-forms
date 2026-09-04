-- Retire the credentials that were minted before a link could lose one.
--
-- The lifecycle hook shipped alongside this restores the invariant on every SAVE of a
-- distribution — but nobody saves a link they closed last month, which is exactly the
-- population the invariant is about. Without this, every already-paused, already-closed
-- and never-published link on an existing install keeps a redeemable `Active` invite until
-- something happens to touch its row, and the headline of bizapps-forms#104 stays true for
-- the whole existing corpus while being false for everything created afterwards.
--
-- No schema change: three guarded UPDATEs, all idempotent, all no-ops on a database that has
-- nothing to fix (the development database this was authored against matches 0 rows).
--
-- Deliberately NOT gated on ChannelType. The hook revokes an unlinkable channel's credential
-- too, but `FORMS_MAGICLINK_CHANNELS` is host configuration and this SQL cannot read it, so
-- this backfill takes only the half that is settled by data: a link that is not open for
-- responses has no business holding a live credential whatever channel it was created under.
-- The remaining case self-heals the next time such a record is saved.

-- OWNERSHIP, on every join below. `FormDistribution.MagicLinkInviteID` carries no foreign key
-- and rides the generated GraphQL update input, so before the hook shipped alongside this it was
-- whatever any client had written there — and this migration's whole population is rows written
-- BEFORE that protection existed. Joining on it alone therefore lets one distribution's row
-- decide the fate of another distribution's invite. The mint recorded the true scope on the
-- invite itself (`ResourceID`, set to the distribution's own ID), so every statement here
-- re-derives it rather than trusting the pointer, exactly as `MagicLinkInviteMinter.writeToInvite`
-- does at runtime for the same reason.
--
-- Getting this wrong is not a near-miss. A CLOSED row pointing at a LIVE row's invite would have
-- step 1 revoke the live credential and step 2 clear only the closed row's columns — leaving the
-- live link holding both halves of a dead credential, which `decideProvisioning` reads as
-- `current` and never re-mints, and which `shareState` badges "Live". A permanently dead public
-- link that the builder reports as healthy, caused by the repair.
--
-- `ResourceID` is nvarchar and `FormDistribution.ID` is uniqueidentifier; SQL Server converts the
-- uniqueidentifier to its canonical string form for the comparison, and the default collation is
-- case-insensitive, so the match does not depend on how a writer cased the UUID. An invite with a
-- NULL or mismatched `ResourceID` is left alone by design: nothing proves it is this link's.

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
  AND i.ResourceID = CAST(d.ID AS nvarchar(50))
  AND (d.Status <> 'Active' OR d.IsActive = 0);
GO

-- 2. The distribution's own copy of it. Both columns clear together, because they are one
--    value — see their descriptions, updated in the migration beside this one. Leaving the
--    token behind would leave `/f/:slug` handing a dead token to the redeem endpoint, and
--    leave the builder badging a link that has no working credential as though it had one.
--
--    Matched on the invite being in ANY terminal status AND step 1's own distribution predicate.
--    `Revoked` is what step 1 writes, so after it has run its rows are exactly the ones this
--    half still owes if it failed the first time — which is what makes the re-run correct. But
--    `Revoked` alone is not the population: an invite ends `Consumed` on its last permitted use
--    (`Expired` is core's for the same idea), and a paused link holding one of those has both
--    columns and no working credential. Left that way, REOPENING it reads as `current` — both
--    halves present, link live — and nothing ever re-mints: a permanently dead link the builder
--    badges as Live. `smoke/backfill-path.mjs` holds that case; it is the one that was missed.
--
--    The status match is also not sufficient on its own, because step 1 is not the only thing
--    that writes `Revoked`.
--
--    `Revoked` is the status MJ core documents as "the primary revocation mechanism", and
--    before this release it was the ONLY way to kill a leaked Forms link without deleting the
--    distribution and losing its slug. So a LIVE distribution pointing at a revoked invite is
--    not a half-finished state to tidy up — it is an operator's deliberate kill, and clearing
--    its columns would revive it: the hook reads a live link holding no credential as "mint
--    one", so the next save of any kind hands the leaked URL a fresh working token under the
--    unchanged slug. The distribution predicate is what keeps this migration to the population
--    the file is about, and it costs nothing: step 1 never revokes a live link's invite, so
--    every row it DID revoke satisfies this too.
UPDATE d
SET d.MagicLinkInviteID = NULL,
    d.PublicLinkToken = NULL
FROM [${flyway:defaultSchema}].[FormDistribution] d
INNER JOIN [${mjSchema}].[MagicLinkInvite] i ON i.ID = d.MagicLinkInviteID
WHERE i.Status <> 'Active'
  AND i.ResourceID = CAST(d.ID AS nvarchar(50))
  AND (d.Status <> 'Active' OR d.IsActive = 0);
GO

-- 3. The other half of the same argument, for links that are still LIVE.
--
--    Steps 1 and 2 answer "a closed link must not keep a redeemable credential". They leave the
--    mirror case untouched: a link that is still open but whose closing date has passed, or is
--    yet to pass, whose invite was minted before an expiry followed that date at all. Those
--    invites carry the ~century `ExpiresAt` this release replaces, and the pass that re-bounds
--    them rides a save — the same save nobody performs on a link they set up last month, which
--    is the entire reason this file exists. Without this, "the expiry now keeps up with the date
--    it mirrors" is true only for links saved after the upgrade.
--
--    It matters because the two gates are independent: the Forms door refuses a submission past
--    `CloseAt`, but core's `/magic-link/redeem` consults only the invite, so a credential whose
--    link shut in June still mints an anonymous session scoped to that distribution until its
--    own `ExpiresAt` — a hundred years out — arrives.
--
--    Only ever moves an expiry EARLIER (`i.ExpiresAt > d.CloseAt`), so it cannot extend the life
--    of any credential, and re-running it matches nothing. `CloseAt IS NULL` means the link has
--    no closing date to mirror and is left alone; a host-wide ceiling is configuration this SQL
--    cannot read, so it stays the running code's business.
UPDATE i
SET i.ExpiresAt = d.CloseAt
FROM [${mjSchema}].[MagicLinkInvite] i
INNER JOIN [${flyway:defaultSchema}].[FormDistribution] d ON d.MagicLinkInviteID = i.ID
WHERE i.Status = 'Active'
  AND i.ResourceID = CAST(d.ID AS nvarchar(50))
  AND d.CloseAt IS NOT NULL
  AND i.ExpiresAt > d.CloseAt;
GO
