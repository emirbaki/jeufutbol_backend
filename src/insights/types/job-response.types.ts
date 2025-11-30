import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class JobIdResponse {
  @Field()
  jobId: string;
}
