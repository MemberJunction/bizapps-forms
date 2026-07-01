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
import type {
  ClientMeta,
  FormAnswerInput,
  FormSubmissionResult,
  FieldError,
} from '@mj-biz-apps/forms-entities';

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

  @Field(() => ID, {
    nullable: true,
    description:
      'Stable client-generated response id (v4 UUID) — the widget mints one per form load and ' +
      'sends it on every autosave AND the final submit. It is the PRIMARY idempotency key: the ' +
      'server adopts it as the FormResponse primary key on first save and upserts THIS row on ' +
      'every repeat, so it works even when the anonymous session id is blank. Adoption of an ' +
      'EXISTING row is gated on session ownership (when a session exists) or a SourceMetadata ' +
      'client-id proof (when it does not), so a guessed id can never hijack another row. Not part ' +
      'of the frozen FormSubmissionInput contract — a widget-session concern.',
  })
  responseId?: string;

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

// --- Compile-time contract lock (S1) ---------------------------------------
//
// These `AssertExact` checks fail `tsc` if the GraphQL DTO drifts from the frozen
// `@mj-biz-apps/forms-entities` contract the widget also codes against. A field rename or a
// type change on either side breaks HERE (loudly, at build) instead of silently at runtime.
//
// Two divergences are DELIBERATE and encoded below, not accidental drift:
//   1. `FormAnswerInputType.jsonValue` is a JSON STRING over the wire, while the contract's
//      `FormAnswerInput.jsonValue` is a structured `JSONValue` (the widget stringifies it in
//      the transport mapping). So the answer lock excludes `jsonValue` and pins it separately.
//   2. `FormSubmissionInputType.responseId` is a transport-only autosave hint that is
//      intentionally NOT part of the frozen `FormSubmissionInput` contract.

/**
 * True only when `A` and `B` have the SAME keys (optionality included) and each property type
 * is invariantly equal. Uses an invariant wrapper `(<T>() => T extends X ? 1 : 2)` so a renamed
 * or added OPTIONAL field is caught — plain bidirectional `extends` misses those because
 * `{a?:X}` is mutually assignable with `{}`.
 */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

/** Compile error unless `T` is exactly `true`. */
type AssertExact<T extends true> = T;

/** The subset of contract `FormAnswerInput` whose fields the DTO must mirror exactly. */
type AnswerContractExceptJson = Omit<FormAnswerInput, 'jsonValue'>;
type AnswerDtoExceptJson = Omit<FormAnswerInputType, 'jsonValue'>;

// Lock: the answer DTO matches the contract on every field EXCEPT the intentional jsonValue
// (string) divergence, which is pinned to `string` here so a change is still caught.
type _LockAnswerFields = AssertExact<Exact<AnswerContractExceptJson, AnswerDtoExceptJson>>;
type _LockAnswerJsonIsString = AssertExact<Exact<FormAnswerInputType['jsonValue'], string | undefined>>;

// Lock: the result DTO the widget reads matches the contract field-for-field, and the nested
// error type matches the contract's FieldError.
type _LockResultFields = AssertExact<Exact<FormSubmissionResult, FormSubmissionResultType>>;
type _LockErrorFields = AssertExact<Exact<FieldError, FieldErrorType>>;
type _LockClientMeta = AssertExact<Exact<ClientMeta, ClientMetaInput>>;

// Reference the aliases so `noUnusedLocals` keeps them (they exist purely for the check above).
export type ContractLocks = [
  _LockAnswerFields,
  _LockAnswerJsonIsString,
  _LockResultFields,
  _LockErrorFields,
  _LockClientMeta,
];
