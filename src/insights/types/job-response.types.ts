import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class JobIdResponse {
  @Field()
  jobId: string;
}

@ObjectType()
export class BatchIndexResponse {
  @Field(() => [String])
  jobIds: string[];

  @Field()
  profileCount: number;
}
