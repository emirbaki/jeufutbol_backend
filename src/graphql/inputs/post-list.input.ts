import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PostStatus } from '../../entities/post.entity';

export enum PostSort {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
}

registerEnumType(PostSort, { name: 'PostSort' });

export const POST_LIST_PLATFORMS = ['x', 'instagram', 'facebook', 'tiktok', 'youtube'];

/** Filters for the post list. The server applies them to all posts of the active workspace. */
@InputType()
export class PostListFilter {
  @Field(() => PostStatus, { nullable: true })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(POST_LIST_PLATFORMS)
  platform?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @Field(() => PostSort, { nullable: true, defaultValue: PostSort.NEWEST })
  @IsOptional()
  @IsEnum(PostSort)
  sort?: PostSort;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
