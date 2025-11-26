import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PostsService } from './post.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { UpdatePostInput } from 'src/graphql/inputs/update-post.input';
import { CreatePostInput } from 'src/graphql/inputs/post.input';
@Resolver()
@UseGuards(GqlAuthGuard)
export class PostsResolver {
  constructor(private postsService: PostsService) { }

  @Mutation(() => Post)
  async createPost(
    @CurrentUser() user: User,
    // @Args('input') input: CreatePostDto,
    @Args('input', { type: () => CreatePostInput }) input: CreatePostInput,
  ): Promise<Post> {
    const _scheduledFor = input.scheduledFor
      ? new Date(input.scheduledFor)
      : null;
    return this.postsService.createPost(user.id, user.tenantId, {
      ...input,
      platformSpecificContent: input.platformSpecificContent,
      scheduledFor: _scheduledFor,
      // ? JSON.parse(input.platformSpecificContent)// : {},
    });
  }

  @Query(() => [Post])
  async getUserPosts(
    @CurrentUser() user: User,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<Post[]> {
    return this.postsService.getUserPosts(user.id, user.tenantId, limit);
  }

  @Query(() => Post)
  async getPost(
    @CurrentUser() user: User,
    @Args('postId') postId: string,
  ): Promise<Post> {
    return this.postsService.getPost(postId, user.id, user.tenantId);
  }

  @Mutation(() => Post)
  async updatePost(
    @CurrentUser() user: User,
    @Args('postId') postId: string,
    // @Args('input') input: Partial<CreatePostDto>,
    @Args('input', { type: () => UpdatePostInput }) input: UpdatePostInput,
  ): Promise<Post> {
    return this.postsService.updatePost(postId, user.id, user.tenantId, {
      ...input,
      platformSpecificContent: input.platformSpecificContent,
      // ? JSON.parse(input.platformSpecificContent): undefined,
    });
  }

  @Mutation(() => Boolean)
  async deletePost(
    @CurrentUser() user: User,
    @Args('postId') postId: string,
  ): Promise<boolean> {
    return this.postsService.deletePost(postId, user.id, user.tenantId);
  }

  @Mutation(() => Post)
  async publishPost(
    @CurrentUser() user: User,
    @Args('postId') postId: string,
  ): Promise<Post> {
    return this.postsService.publishPost(postId, user.id, user.tenantId);
  }
}
