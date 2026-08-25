/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  /**
   * MemberJunction minimal distribution configuration for the Forms Open App.
   *
   * Most settings come from package defaults:
   * - Database settings → environment variables (.env)
   * - CodeGen settings → DEFAULT_CODEGEN_CONFIG (@memberjunction/codegen-lib)
   *
   * Only deployment-specific bits are specified here (output paths, build
   * commands, schema placeholders, new-entity defaults).
   */

  // ============================================================================
  // DEPLOYMENT-SPECIFIC CONFIGURATION
  // ============================================================================

  /** npm package that receives generated entity subclasses */
  entityPackageName: '@mj-biz-apps/forms-entities',

  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './packages/Angular/src/lib/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    { type: 'GraphQLServer', directory: './packages/Server/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/Actions/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/Entities/src/generated' },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],

  /** Build commands run after code generation */
  commands: [
    { workingDirectory: './packages/Entities', command: 'pnpm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Actions', command: 'pnpm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Server', command: 'pnpm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Angular', command: 'pnpm', args: ['run', 'build'], when: 'after' },
  ],

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================

  /**
   * New-entity defaults. Forms entities live in the __mj_BizAppsForms schema
   * and get a "MJ_BizApps_Forms: " entity-name prefix to avoid collisions with MJ core
   * and other apps. (MJ core entities use the "MJ: " prefix.)
   */
  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      { SchemaName: '__mj_BizAppsForms', EntityNamePrefix: 'MJ_BizApps_Forms: ', EntityNameSuffix: '' },
      // PostgreSQL folds the unquoted schema name to lower case, and these rules match
      // case-sensitively — without the twin, entities discovered on PG get no prefix.
      { SchemaName: '__mj_bizappsforms', EntityNamePrefix: 'MJ_BizApps_Forms: ', EntityNameSuffix: '' },
    ],
  },

  /**
   * The ONE schema this distribution's CodeGen may generate from.
   *
   * `includeSchemas` is an opt-in positive scope: CodeGen resolves it into
   * `excludeSchemas` before metadata management and again before file generation, so
   * every schema in the database that is NOT named here is treated as excluded —
   * including schemas this repo has never heard of.
   *
   * That last part is why this is an allow-list rather than a deny-list. CodeGen runs
   * against a database that also hosts the sibling Open Apps (bizapps-common and
   * bizapps-tasks are hard `mj-app.json` dependencies, so they are always installed
   * alongside Forms) — but a real deployment holds more than that. bizapps-caliber, for
   * one, already shares a database with all three and owns `__mj_BizAppsCaliber`, which
   * no deny-list maintained here could ever have named in advance. An allow-list needs
   * no advance knowledge: anything unnamed is out of scope by construction.
   *
   * Without correct scoping, CodeGen emits entity subclasses, GraphQL resolvers, and
   * Angular form components for OTHER schemas into the Forms packages — and because
   * forms-server exports RESOLVER_PATHS that MJ's server-bootstrap merges into a single
   * type-graphql schema, the duplicate type names make MJAPI fail to start outright:
   *
   *   Error: Schema must contain uniquely named types but contains multiple
   *   types named "mjBizAppsTasksTaskActivity_".
   *
   * Forms still has legitimate cross-schema FKs (e.g. FormResponse.RespondentPersonID
   * -> MJ_BizApps_Common: People); leaving a schema out of scope only stops us
   * GENERATING its artifacts, it does not sever the relationship. Consume those entity
   * types from @mj-biz-apps/common-entities / @mj-biz-apps/tasks-entities instead.
   *
   * Requires MJ >= 5.50.0 (`includeSchemas` ships there). Guarded by
   * `npm run lint:generated`. See issue #10.
   */
  // Both cases are listed for the same reason as the rules above: on PostgreSQL the
  // physical schema is '__mj_bizappsforms', and an allow-list that names only the
  // mixed-case spelling excludes Forms' own schema from its own CodeGen run.
  includeSchemas: ['__mj_BizAppsForms', '__mj_bizappsforms'],

  // Empty on purpose. includeSchemas is the scope; unnamed schemas (core,
  // siblings, never-seen) are already out. mj app install may append here
  // on a consumer host, so keep the key.
  excludeSchemas: [],

  /** SQL migration output for CodeGen-produced objects */
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/codegen/',
    appendToFile: false,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: false,
    schemaPlaceholders: [
      // Order matters: the more-specific app schema must come first so the
      // greedy '__mj' rule doesn't partially match '__mj_BizAppsForms'.
      { schema: '__mj_BizAppsForms', placeholder: '${flyway:defaultSchema}' },
      // PostgreSQL folds unquoted identifiers to lower case, so CodeGen reads the physical
      // schema names back from the database in lower case and these rules — which match
      // case-SENSITIVELY — miss. The generic '__mj' rule below then matches the '__mj'
      // PREFIX of '__mj_bizappsforms' and emits '${mjSchema}_bizappsforms', which resolves
      // to a schema that does not exist. These lower-case twins must sit above the generic
      // rule for the same greedy-match reason as the mixed-case ones.
      { schema: '__mj_bizappsforms', placeholder: '${flyway:defaultSchema}' },
      // The sibling schemas map to THEMSELVES. These identity rules exist only to shadow the
      // greedy '__mj' rule below, which would otherwise match the '__mj' PREFIX of
      // '__mj_BizAppsCommon' and emit '${mjSchema}_BizAppsCommon'.
      //
      // A previous version mapped them to a '${commonSchema}' placeholder instead. That was
      // wrong in a way only visible OFF this machine: `mj migrate` builds Skyway's placeholder
      // map from THIS file, so '${commonSchema}' resolved locally and the migrations looked
      // fine — but `mj app install` builds it from the HOST's mj.config.cjs
      // (MJCLI/src/utils/open-app-context.ts -> openApps.migrationPlaceholders), which has
      // never heard of us. Skyway deliberately leaves an unknown '${...}' untouched rather
      // than failing (skyway-core/executor/placeholder.js), so the literal string
      // '${commonSchema}' would have survived into the @ExcludedSchemaNames lists and stopped
      // excluding bizapps-common — letting our migration's CodeGen sweeps
      // (spUpdateExistingEntitiesFromSchema, spDeleteUnneededEntityFields) run over another
      // installed app's metadata. Only '${flyway:defaultSchema}' and '${mjSchema}' are
      // supplied by the install engine itself; nothing else may appear in shipped SQL.
      { schema: '__mj_BizAppsCommon', placeholder: '__mj_BizAppsCommon' },
      { schema: '__mj_bizappscommon', placeholder: '__mj_bizappscommon' },
      { schema: '__mj_BizAppsTasks', placeholder: '__mj_BizAppsTasks' },
      { schema: '__mj_bizappstasks', placeholder: '__mj_bizappstasks' },
      { schema: '__mj', placeholder: '${mjSchema}' },
    ],
  },
};
