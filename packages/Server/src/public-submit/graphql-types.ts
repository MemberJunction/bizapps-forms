/**
 * TypeGraphQL input/output types for the public submit + read API (seam S1).
 *
 * These are the GraphQL surface WP-C codes against. The full nested
 * {@link PublishedFormDefinition} is carried as a single `definitionJSON` string
 * (the widget parses it with the SHARED contract types — the same JSON it would
 * receive from `FormVersion.DefinitionSnapshot`), with the stable top-level fields
 * also exposed as scalars for convenience. This keeps the GraphQL schema from
 * duplicating — and drifting from — the TS contract's deep page/question/option
 * tree.
 */
import { Field, ID, InputType, ObjectType, Float } from 'type-graphql';

// --- PublishedForm (read) --------------------------------------------------

@ObjectType({ description: 'A published form resolved from a public distribution slug.' })
export class PublishedFormType {
  @Field(() => ID)
  formId!: string;

  @Field(() => ID)
  formVersionId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ description: "Render mode: 'Scroll' | 'OneQuestion'." })
  renderMode!: string;

  @Field({ description: 'JSON-encoded FormSettings (FormSettings contract).' })
  settingsJSON!: string;

  @Field({ description: 'JSON-encoded FormStyleTokens (--mj-* / --mjf-* overrides).' })
  styleTokensJSON!: string;

  @Field({ description: 'JSON-encoded full PublishedFormDefinition (pages -> questions -> options).' })
  definitionJSON!: string;
}

// --- SubmitFormResponse (write) --------------------------------------------

@InputType({ description: 'Lightweight client telemetry; IP-hash is derived server-side.' })
export class ClientMetaInput {
  @Field({ nullable: true })
  referrer?: string;

  @Field({ nullable: true })
  userAgent?: string;
}

@InputType({ description: 'One answer in a submission (exactly one typed value, or jsonValue).' })
export class FormAnswerInputType {
  @Field(() => ID)
  questionId!: string;

  @Field({ nullable: true })
  textValue?: string;

  @Field(() => Float, { nullable: true })
  numericValue?: number;

  @Field({ nullable: true })
  dateValue?: string;

  @Field(() => Boolean, { nullable: true })
  booleanValue?: boolean;

  @Field({ nullable: true, description: 'JSON string for multi/complex answers.' })
  jsonValue?: string;

  @Field(() => ID, { nullable: true })
  fileId?: string;
}

@InputType({ description: 'Payload posted to SubmitFormResponse.' })
export class FormSubmissionInputType {
  @Field({ description: 'Resolves FormDistribution -> Form -> published FormVersion.' })
  distributionSlug!: string;

  @Field(() => ID, { description: 'Echoed from PublishedForm; pins the response version.' })
  formVersionId!: string;

  @Field(() => Boolean, { nullable: true, description: 'true => Partial, false/absent => Complete.' })
  partial?: boolean;

  @Field({ nullable: true })
  startedAt?: string;

  @Field({ nullable: true, description: 'Turnstile token; required iff captcha is on.' })
  turnstileToken?: string;

  @Field(() => ClientMetaInput, { nullable: true })
  clientMeta?: ClientMetaInput;

  @Field(() => [FormAnswerInputType])
  answers!: FormAnswerInputType[];
}

@ObjectType({ description: 'A single validation/processing error, optionally tied to a question.' })
export class FieldErrorType {
  @Field(() => ID, { nullable: true })
  questionId?: string;

  @Field()
  message!: string;
}

@ObjectType({ description: 'Result of SubmitFormResponse.' })
export class FormSubmissionResultType {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => ID, { nullable: true })
  responseId?: string;

  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  confirmationMessage?: string;

  @Field({ nullable: true })
  redirectUrl?: string;

  @Field(() => [FieldErrorType], { nullable: true })
  errors?: FieldErrorType[];
}
