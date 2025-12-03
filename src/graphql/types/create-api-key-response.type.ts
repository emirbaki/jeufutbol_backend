import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class CreateApiKeyResponse {
    @Field()
    id: string;

    @Field()
    name: string;

    @Field()
    apiKey: string; // Plain text - only shown once

    @Field()
    keyPrefix: string;

    @Field(() => [String])
    scopes: string[];

    @Field({ nullable: true })
    expiresAt?: Date;
}
