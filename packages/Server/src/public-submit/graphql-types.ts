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

/**
 * One answer as it arrives on the wire.
 *
 * Every typed field is `| null` because `nullable: true` means a client may send an explicit
 * `null`, and TypeGraphQL passes that through as `null` rather than dropping it. Typing them as
 * merely optional told the compiler a value could not arrive that demonstrably does, which is how
 * a `null.trim()` reached the anonymous public write path twice — once through `jsonValue` and
 * again through `dateValue`. See `FormAnswerInput`.
 */
@InputType({ description: 'One answer in a submission (exactly one typed value, or jsonValue).' })
export class FormAnswerInputType {
  @Field(() => ID)
  questionId!: string;

  @Field({ nullable: true })
  textValue?: string | null;

  @Field(() => Float, { nullable: true })
  numericValue?: number | null;

  @Field({ nullable: true })
  dateValue?: string | null;

  @Field(() => Boolean, { nullable: true })
  booleanValue?: boolean | null;

  @Field({ nullable: true, description: 'JSON string for multi/complex answers.' })
  jsonValue?: string | null;

  @Field(() => ID, { nullable: true })
  fileId?: string | null;
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
      'every repeat, so it works even when the anonymous session id is blank. Adopting an ' +
      'EXISTING row is gated at the WRITE, not at the lookup that found it: a row whose ' +
      'AnonymousSessionID is set may only be written by that session, whatever this id says and ' +
      'whether or not an x-session-id header is sent. Not part of the frozen ' +
      'FormSubmissionInput contract — a widget-session concern.',
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

  /**
   * Derived from the contract (which derives it from the entity) so the lock below keeps holding
   * as the CHECK constraint's value list grows. `() => String` is explicit because TypeGraphQL
   * cannot infer a runtime type from a union of string literals.
   */
  @Field(() => String, { nullable: true })
  status?: FormSubmissionResult['status'];

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

/**
 * Resolve a type to its plain property shape, preserving optionality.
 *
 * {@link Exact} compares DECLARED types, and a `@ObjectType()` class does not declare its members
 * identically to the interface it mirrors even when every field resolves the same — so under
 * `strictNullChecks` the class-vs-interface locks below reported a divergence that does not exist
 * (both assignability directions hold, and each field is individually `Exact`). Mapping both sides
 * through this compares the shapes rather than the declarations. It normalises the container, not
 * the fields: a field whose TYPE actually differs still fails. Verified by injection — changing one
 * DTO field's type still breaks `npm run typecheck`, which is the gate these locks are enforced by
 * (Vitest does not type-check, so no runtime spec can stand in for it).
 */
type Shape<T> = { [K in keyof T]: T[K] };

/** The subset of contract `FormAnswerInput` whose fields the DTO must mirror exactly. */
type AnswerContractExceptJson = Omit<FormAnswerInput, 'jsonValue'>;
type AnswerDtoExceptJson = Omit<FormAnswerInputType, 'jsonValue'>;

// Lock: the answer DTO matches the contract on every field EXCEPT the intentional jsonValue
// (string) divergence, which is pinned to `string` here so a change is still caught.
type _LockAnswerFields = AssertExact<Exact<Shape<AnswerContractExceptJson>, Shape<AnswerDtoExceptJson>>>;
// `string | null | undefined`, and the `null` is load-bearing: this DTO accepts an EXPLICIT null
// because a client sending one is what put `null.trim()` on the anonymous public write path twice
// (see the field's own comment). The pin said `string | undefined`, which was only ever true with
// `strictNullChecks` off — it silently stopped describing the field the moment the flag went on.
type _LockAnswerJsonIsString = AssertExact<Exact<FormAnswerInputType['jsonValue'], string | null | undefined>>;

// Lock: the result DTO the widget reads matches the contract field-for-field, and the nested
// error type matches the contract's FieldError.
type _LockResultFields = AssertExact<Exact<Shape<FormSubmissionResult>, Shape<FormSubmissionResultType>>>;
type _LockErrorFields = AssertExact<Exact<Shape<FieldError>, Shape<FieldErrorType>>>;
type _LockClientMeta = AssertExact<Exact<Shape<ClientMeta>, Shape<ClientMetaInput>>>;

// Reference the aliases so `noUnusedLocals` keeps them (they exist purely for the check above).
export type ContractLocks = [
  _LockAnswerFields,
  _LockAnswerJsonIsString,
  _LockResultFields,
  _LockErrorFields,
  _LockClientMeta,
];
