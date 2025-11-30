import { ObjectType, Field, Int, registerEnumType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { JobStatusEnum } from '../insights/dto/job.dto';

// Register enum for GraphQL
registerEnumType(JobStatusEnum, {
  name: 'JobStatus',
  description: 'Status of a background job',
});

@ObjectType()
export class JobStatusObject {
  @Field()
  id: string;

  @Field(() => JobStatusEnum)
  status: JobStatusEnum;

  @Field(() => Int)
  progress: number;

  @Field(() => GraphQLJSON, { nullable: true })
  result?: any;

  @Field({ nullable: true })
  error?: string;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  finishedAt?: Date;
}

@ObjectType()
export class JobResultObject {
  @Field()
  jobId: string;

  @Field(() => GraphQLJSON)
  result: any;
}
