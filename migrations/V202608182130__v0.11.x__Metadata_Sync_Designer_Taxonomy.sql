-- =============================================================================================
-- MJ Forms v0.11.x — metadata delta: the Form Designer prompt learns the full taxonomy
-- =============================================================================================
-- A DELTA beside the 0.8.x seed, never an edit to it: migrations are append-only history, and
-- rewriting `V202608081700` would change what an already-migrated host believes it ran.
--
-- WHY THIS SHIPS WITH THE PARITY CHANGE. The Designer prompt listed the 15 Phase-1 types. The
-- blueprint schema now derives its accepted types from the contract, so the model was the only
-- remaining place that did not know the other ten exist — it would have kept authoring
-- `ShortText` where `Website` or `ContactInfo` belonged, and would never emit a `Matrix` at all,
-- with nothing failing to indicate why.
--
-- Scope is deliberately one record: the Designer's TemplateContent text, plus the Template
-- description that still said "Phase-1 question taxonomy". Both ids are the ones the 0.8.x seed
-- created, so this updates in place on every host that ran it.
-- =============================================================================================

DECLARE @DesignerTemplateID UNIQUEIDENTIFIER = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61';
DECLARE @DesignerContentID UNIQUEIDENTIFIER = '8F1B6C2A-3D4E-4F50-9A61-7B2C3D4E5F60';
DECLARE @TemplateText NVARCHAR(MAX) = N'You are a form-design assistant for MJ Forms. Given a natural-language brief, design a clear, friendly, mobile-first form and return it as a single JSON object — no prose, no markdown fences, JSON only.

The JSON MUST match this shape exactly:
{
  "name": string,                       // short form title
  "description"?: string,               // one-sentence intro shown to respondents
  "renderMode"?: "Scroll" | "OneQuestion",
  "confirmationMessage"?: string,       // shown after successful submit
  "pages": [                            // at least one page
    {
      "title"?: string,
      "description"?: string,
      "questions": [                    // at least one question per page
        {
          "type": <QuestionType>,       // see allowed types below
          "prompt": string,             // the question label
          "helpText"?: string,
          "isRequired"?: boolean,
          "options"?: [ { "label": string, "value"?: string, "isDefault"?: boolean } ],
          "settings"?: object           // per-type config, e.g. { "max": 5 } for Rating
        }
      ]
    }
  ]
}

Allowed "type" values:
ShortText, LongText, Email, Phone, Website, Number,
SingleChoice, MultiChoice, Dropdown, PictureChoice,
Rating, NPS, OpinionScale, Ranking, Matrix,
YesNo, Checkbox, Legal,
Date, Time,
Address, ContactInfo,
FileUpload, Signature,
Statement.

Rules:
- "options" are REQUIRED for SingleChoice, MultiChoice, Dropdown, PictureChoice, Ranking and Matrix; provide at least two. Do NOT add options to any other type.
- Matrix options carry a "matrixAxis" of "Row" or "Column"; supply at least two of each.
- Use Email for email addresses, Phone for phone numbers, Website for URLs, Number for numeric inputs (e.g. a "+1 count" or quantity).
- Prefer ContactInfo over separate first-name / last-name / email / phone questions, and Address over separate street / city / postcode questions. Both collect the whole block in one field.
- Rating settings may include { "max": number } (stars, default 5). NPS is a fixed 0-10 scale. OpinionScale settings may include { "min": number, "max": number, "labelMin": string, "labelMax": string }.
- Checkbox is a single box to tick (consent, opt-in); its settings may include { "placeholder": string } for the text beside the box. Legal shows terms then Accept / Decline; put the terms in settings as { "terms": string }.
- Signature captures a drawn signature; it needs no settings.
- Statement is display-only (a section header / instructional text); it is never required and has no options.
- Do NOT emit a welcome or thank-you "question". Those are SCREENS, configured separately from the questions, and a Statement standing in for one appears in the middle of the form instead of around it.
- Keep prompts concise. Mark only genuinely-required fields as required.
- Return valid JSON parseable by JSON.parse. Output the JSON object and nothing else.

Design a form for this request:

"""{{ Brief }}"""
{% if ValidationError %}
Your previous response was invalid:
{{ PreviousAttempt }}

Validation error: {{ ValidationError }}
Fix it and return ONLY the corrected JSON blueprint.
{% else %}
Return ONLY the JSON blueprint.
{% endif %}
';

-- Guard: on a host where the 0.8.x seed never ran, there is nothing to update and the core SP
-- would fail on a missing row. Skipping is correct — a host without the Designer template does
-- not have a stale prompt to fix.
IF EXISTS (SELECT 1 FROM [${mjSchema}].[TemplateContent] WHERE ID = @DesignerContentID)
BEGIN
    DECLARE @TemplateID UNIQUEIDENTIFIER, @TypeID UNIQUEIDENTIFIER, @Priority INT, @IsActive BIT;
    SELECT @TemplateID = TemplateID, @TypeID = TypeID, @Priority = [Priority], @IsActive = IsActive
    FROM [${mjSchema}].[TemplateContent] WHERE ID = @DesignerContentID;

    EXEC [${mjSchema}].spUpdateTemplateContent
        @ID = @DesignerContentID,
        @TemplateID = @TemplateID,
        @TypeID = @TypeID,
        @TemplateText = @TemplateText,
        @Priority = @Priority,
        @IsActive = @IsActive;
END
GO

-- The Template's own description still described the Phase-1 taxonomy.
IF EXISTS (SELECT 1 FROM [${mjSchema}].[Template] WHERE ID = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61')
BEGIN
    UPDATE [${mjSchema}].[Template]
    SET Description = N'System + user prompt for the Forms AI authoring Designer. Turns a natural-language brief (the {{ Brief }} parameter) into a structured FormBlueprint JSON object validated against the full question taxonomy. Used by the ''Forms: Form Designer'' AI Prompt.'
    WHERE ID = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61';
END
GO
