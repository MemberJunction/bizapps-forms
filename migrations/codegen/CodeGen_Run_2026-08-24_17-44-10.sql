/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* Generated Validation Functions for MJ_BizApps_Forms: Forms */
-- CHECK constraint for MJ_BizApps_Forms: Forms @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([IsTemplate]=(0) OR [Status]<>''Published'')', 'public ValidateTemplateStatusRestriction(result: ValidationResult) {
	if (this.IsTemplate && this.Status === ''Published'') {
		result.Errors.push(new ValidationErrorInfo(
			"Status",
			"A template cannot have a ''Published'' status.",
			this.Status,
			ValidationErrorType.Failure
		));
	}
}', 'Templates cannot be published. If an item is marked as a template, its status must be something other than ''Published''.', 'ValidateTemplateStatusRestriction', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8');

