import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { InsightType } from '../../entities/insight.entity';
import { GraphQLJSONObject } from 'graphql-type-json';

registerEnumType(InsightType, {
  name: 'InsightType',
});

@ObjectType()
export class InsightObjectType {
  @Field(() => ID)
  id: string;

  @Field(() => InsightType)
  type: InsightType;

  @Field()
  title: string;

  @Field()
  description: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  metadata?: Record<string, any>;

  @Field()
  relevanceScore: number;

  @Field()
  isRead: boolean;

  @Field()
  createdAt: Date;
}
