-- =============================================================================================
-- MJ Forms v0.12.x — a distribution may name the origins permitted to embed it (#203)
-- =============================================================================================
-- WHAT THIS OPENS. Forms had NO origin control of any kind. `grep -rn "AllowedOrigins"
-- packages migrations` returned nothing, and `grep -rni "cors|access-control-allow-origin"
-- packages/Server/src` returned nothing outside tests. The only lever reaching a Forms request
-- was MJ core's host-wide `cors.allowedOrigins` (default `['*']`), which is all-or-nothing across
-- every app sharing the host and cannot express "this link may be embedded on customer A's site".
-- The product ruling is that the widget embeds on customer-controlled third-party sites, so the
-- authorization unit has to be the DISTRIBUTION — the thing a customer is actually given.
--
-- WHY A REAL COLUMN AND NOT A KEY IN AN EXISTING JSON BLOB. This value is an authorization input:
-- a gate on the public submit path reads it on every request, and the respondent-host door turns it
-- into a `Content-Security-Policy` header. Forms' own precedent for exactly this reasoning is
-- `V202609091600`, which added `FormResponse.FormDistributionID` rather than reading the same fact
-- out of `SourceMetadata` with `JSON_VALUE`: a free-form blob the application rewrites on every
-- save is not a thing to key authorization on. `FormDistribution` is also where the sibling
-- deployment-shaped switches already live (`CaptchaRequired`, `AllowDeviceResume`), which is what
-- makes this the right table rather than a new one.
--
-- THE CONTAINER IS A JSON ARRAY, AND THAT IS THE ONE DELIBERATE DIVERGENCE FROM CALIBER.
-- `bizapps-caliber`'s `Step.AllowedOrigins` (V202609021400) holds a KEYED JSON OBJECT, because a
-- Caliber step inherits its config down a company -> step chain and a child must be able to add one
-- origin, keep inheriting the rest, and tombstone an inherited one with `__suppress`. A keyed list
-- is the shape that shared merge machinery consumes. A Forms distribution inherits from nothing —
-- it is a leaf, authored whole, with no parent to merge against — so the keys would name a
-- vocabulary with nothing to say and every author would have to learn it to write `{}` as a value.
-- The GRAMMAR of a single entry is Caliber's, unchanged and deliberately so (see
-- `packages/Entities/src/contracts/allowed-origins.ts`, which cites its counterpart): a full browser
-- origin, matched exactly, no wildcards. Only the container differs, and only because the reason
-- Caliber's container exists does not exist here.
--
-- NULL AND EMPTY MEAN UNRESTRICTED, which is what keeps every live embed working — every existing
-- distribution is NULL and none of them changes behaviour. Once a distribution authors ANY origin
-- the check is fail-CLOSED for that distribution: an absent or unmatched `Origin` is a refusal, not
-- a warning, because an allowlist that admits on no-match is decorative. An authored value that
-- parses to NOTHING USABLE (invalid JSON, or every entry refused by the grammar) is likewise a
-- refusal of everything rather than a fall back to unrestricted — an author who wrote something
-- plainly meant to restrict something, and silently ignoring them is the worst of the three answers.
--
-- WHAT IT IS NOT. Defense in depth behind the magic link, not a replacement for it. A distribution's
-- link is anonymous and multi-use by construction, so a leaked link is replayable from anywhere
-- until it closes; an allowlist bounds that to pages the author named. Nothing here weakens the case
-- for `CloseAt` / `MaxResponses`.
--
-- No __mj_* timestamp columns and no index: CodeGen adds the former and there is nothing here to
-- index (the value is read only after the row has been found by Slug). `sp_addextendedproperty` on
-- the business column, through an NVARCHAR(4000) variable — `@value` is `sql_variant`, which cannot
-- hold ANY MAX type, and passing one fails the whole batch with `Operand type clash`.
--
-- ⚠️ RUN `npm run mj:codegen` AFTER APPLYING THIS. The column needs its `EntityField` row and its
-- generated entity property; without the `EntityField` row `BaseEntity` silently drops the value on
-- every save, and the server code in this release READS this column on the public submit path.
-- =============================================================================================

-- ── The column ────────────────────────────────────────────────────────────────────────────────
-- Guarded, so a re-run on a host that already has it changes nothing.
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[FormDistribution]')
                 AND name = N'AllowedOrigins')
    ALTER TABLE [${flyway:defaultSchema}].[FormDistribution]
        ADD [AllowedOrigins] NVARCHAR(MAX) NULL;
GO

DECLARE @allowedOrigins NVARCHAR(4000) = N'JSON array of the browser ORIGINS permitted to embed this distribution and call the public form API with its link — e.g. ["https://careers.acme.com","https://acme.com:8443"]. Values are full origins exactly as a browser sends them (scheme, host, optional port), matched EXACTLY after case-normalising scheme and host. No wildcards and no subdomain implication: "acme.com" does not admit "https://careers.acme.com", and an author needing three subdomains names three origins — a pattern is refused at authoring time rather than accepted and ignored. Plain http is accepted only for loopback hosts, so a local harness is authorable without a proxy. NULL or an empty array (the default, and every distribution until an author sets one) means UNRESTRICTED, so no existing embed changes behaviour. Once ANY origin is authored the distribution is fail-closed: the respondent host page is served with a Content-Security-Policy frame-ancestors directive naming exactly these origins, and a public API call whose Origin is neither this API''s own origin nor one of them is refused. An authored value that parses to nothing usable is a refusal of everything, never a fall back to unrestricted. Defense in depth behind the magic link, not a replacement for it: it bounds where a leaked multi-use link can be replayed. The array container differs deliberately from the keyed object bizapps-caliber uses for Step.AllowedOrigins, which is keyed only because Caliber steps inherit and must tombstone an inherited origin; a Forms distribution is a leaf and inherits from nothing. The per-entry grammar is identical.';

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
    INNER JOIN sys.tables  t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE ep.name = N'MS_Description' AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'FormDistribution' AND c.name = N'AllowedOrigins')
    EXEC sp_updateextendedproperty @name = N'MS_Description', @value = @allowedOrigins,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'AllowedOrigins';
ELSE
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = @allowedOrigins,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'AllowedOrigins';
GO
