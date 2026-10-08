/**
 * TypeGraphQL output types for the `FormDistributionClaims` author query.
 *
 * Every `@Field` names its type with an explicit function. The Server build has `strictNullChecks`
 * off and `emitDecoratorMetadata` on, so an implicit type on a nullable member would emit `Object`
 * and type-graphql would refuse to build the schema at boot.
 */
import { Field, ObjectType } from 'type-graphql';

@ObjectType({ description: 'A share-link slug that another app owns.' })
export class DistributionClaimType {
  @Field(() => String, { description: 'The app that owns the slug, e.g. "Caliber".' })
  appName!: string;

  @Field(() => String, { description: 'The claimed slug; always one of the form\'s own.' })
  slug!: string;

  @Field(() => String, { description: 'What inside the app owns the slug, e.g. an interview step name.' })
  ownerLabel!: string;

  @Field(() => String, { nullable: true, description: "The owning app's own public link, or null when it must not be published." })
  respondentUrl!: string | null;
}

@ObjectType({ description: 'An app that could not be consulted, or whose answer was partly refused.' })
export class DistributionClaimFailureType {
  @Field(() => String)
  appName!: string;

  @Field(() => String)
  message!: string;
}

@ObjectType({ description: 'Which of a form\'s share-link slugs other apps own, plus what went wrong asking.' })
export class DistributionClaimsResultType {
  @Field(() => [DistributionClaimType])
  claims!: DistributionClaimType[];

  @Field(() => [DistributionClaimFailureType])
  failures!: DistributionClaimFailureType[];
}
