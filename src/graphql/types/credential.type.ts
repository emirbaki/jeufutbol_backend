import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CredentialType {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  platform: string;

  @Field()
  accountName: string;

  @Field({ nullable: true })
  accountImage?: string;

  @Field()
  isActive: boolean;

  @Field({ nullable: true })
  tokenExpiresAt?: Date;

  @Field()
  createdAt: Date;
}
