import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class AcceptInvitationResponse {
    @Field()
    message: string;

    @Field()
    accessToken: string;
}
