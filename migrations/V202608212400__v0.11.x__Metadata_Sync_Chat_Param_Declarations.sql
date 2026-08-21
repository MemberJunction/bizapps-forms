-- ---------------------------------------------------------------------------------------------
-- Metadata seed correction: make the Chat Assistant's template params match metadata/.
--
-- WHAT IS WRONG. MetadataSync emits each `MJ: Template Params` row TWICE per generated migration
-- — once with the values declared in `metadata/templates/.forms-chat-assistant-template.json`, and
-- again with auto-generated text. The SECOND write wins. So every seed from V202608212000 onward
-- has landed these six rows with generic descriptions ("Data representing the structure of the
-- currently open form") and, for `FormContext` and `HasOpenForm`, `IsRequired = 0` where the
-- repo's declared source of truth says 1.
--
-- WHY IT MATTERS EVEN THOUGH NOTHING IS BROKEN TODAY. `chat-assistant-model.ts` always supplies
-- all six values, so no prompt run fails for want of a "required" param. The damage is to the
-- seed's own integrity: a fresh install's rows do not match `metadata/`, so the next `mj sync
-- push` sees a delta that is not a real change, ships it, and the seed after that overwrites it
-- again. The distribution gate cannot see this — CHECK 1 hashes `metadata/` against a manifest,
-- never against what the seed actually writes.
--
-- WHY A NEW FILE RATHER THAN A FIX TO V202608212000. Shipped migrations are immutable; a host
-- that already ran it would never see an edit. This runs after it and states the intended end
-- state directly.
--
-- WHAT THIS DOES NOT FIX. The duplicate emission is MetadataSync's behaviour, not ours, so the
-- NEXT regenerated seed will reintroduce it. Whoever regenerates: diff the emitted TemplateParam
-- blocks against this file, and re-apply these values if the generator has overwritten them again.
-- ---------------------------------------------------------------------------------------------

UPDATE [${mjSchema}].[TemplateParam]
SET [Description] = N'What the author just typed.',
    [IsRequired]  = 1,
    [Type]        = N'Scalar'
WHERE [ID] = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E90';
GO

UPDATE [${mjSchema}].[TemplateParam]
SET [Description] = N'The prior turns as a plain transcript, oldest first and capped, so the prompt does not grow without bound.',
    [IsRequired]  = 1,
    [Type]        = N'Scalar'
WHERE [ID] = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E91';
GO

UPDATE [${mjSchema}].[TemplateParam]
SET [Description] = N'A compact description of the form on screen: its name, its questions and its current tokens.',
    [IsRequired]  = 1,
    [Type]        = N'Scalar'
WHERE [ID] = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E92';
GO

UPDATE [${mjSchema}].[TemplateParam]
SET [Description] = N'''yes'' when a form is open, so the prompt can drop the restyle affordance when there is nothing to restyle.',
    [IsRequired]  = 1,
    [Type]        = N'Scalar'
WHERE [ID] = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E93';
GO

UPDATE [${mjSchema}].[TemplateParam]
SET [Description] = N'The --mjf-* vocabulary, supplied by the code that owns it so the prompt and the validator cannot disagree.',
    [IsRequired]  = 1,
    [Type]        = N'Scalar'
WHERE [ID] = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E94';
GO

UPDATE [${mjSchema}].[TemplateParam]
SET [Description] = N'The author''s own forms, by handle, so the assistant can name one to open. Read-only — opening navigates, it never writes.',
    [IsRequired]  = 1,
    [Type]        = N'Scalar'
WHERE [ID] = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E95';
GO
