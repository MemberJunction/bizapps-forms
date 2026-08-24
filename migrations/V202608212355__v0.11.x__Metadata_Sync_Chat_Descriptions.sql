-- ---------------------------------------------------------------------------------------------
-- Metadata seed delta: two operator-visible descriptions that still name four actions.
--
-- WHAT THIS CARRIES
--   * 'Forms: Chat Assistant' AIPrompt.Description
--   * 'MJ_BizApps_Forms: Chat Assistant' Template.Description
--
-- WHY. Both said the chat "declares an action — none, create, restyle, or unsupported". Seven ship:
-- `image` arrived with V202608212100, `edit` and `open` with V202608212200, and neither migration
-- touched these two rows. They are what an operator reads in Explorer when deciding what this
-- prompt is for, and they were the last place in `metadata/` still describing the four-action
-- version — the prompt BODY, its params and the action rows were all corrected earlier in this PR.
--
-- No behaviour depends on either string. This is the seed agreeing with itself.
-- ---------------------------------------------------------------------------------------------

UPDATE [${mjSchema}].[AIPrompt]
SET [Description] = N'The conversational surface of AI authoring. Replies to the author AND declares an action — none, create, restyle, image, edit, open, or unsupported — which deterministic code then performs. The model never touches the database, the same split the rest of the authoring pipeline uses. Model selection is metadata-driven and this prompt is the most likely to want a different tier from the structural stages, since it is conversational rather than generative.'
WHERE [ID] = '6B7C8D9E-0F1A-4B2C-3D4E-5F6071829308';
GO

UPDATE [${mjSchema}].[Template]
SET [Description] = N'The authoring chat. Given the conversation so far, the form on screen and the author''s new message, replies and declares what should be done about it: nothing, create a form, restyle the open one, put a picture on a screen, change the open form''s structure, open another of the author''s forms, or say plainly that the change is not supported yet.'
WHERE [ID] = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F65';
GO
