import { InputType, Field } from '@nestjs/graphql';
import { IsISO8601, IsOptional } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreatePostInput {
  @Field()
  content: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  mediaUrls: string[];

  @Field(() => [String])
  targetPlatforms: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  platformSpecificContent: Record<string, any>;

  @IsOptional()
  @IsISO8601()
  @Field(() => String, { nullable: true })
  scheduledFor: string | null;
}
