import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards, UseInterceptors, Inject } from '@nestjs/common';
import {
  CacheInterceptor,
  CacheTTL,
  CACHE_MANAGER,
} from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { GraphqlCacheInterceptor } from '../cache/graphql-cache.interceptor';
import { MonitoringService } from './monitoring.service';
import { TweetsService } from '../tweets/tweets.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Tweet } from '../entities/tweet.entity';
import GraphQLJSON from 'graphql-type-json';
import { JobIdResponse } from '../insights/types/job-response.types';

@Resolver()
@UseGuards(GqlAuthGuard)
@UseInterceptors(GraphqlCacheInterceptor)
export class MonitoringResolver {
  constructor(
    private monitoringService: MonitoringService,
    private tweetsService: TweetsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Query(() => [MonitoredProfile])
  async getMonitoredProfiles(
    @CurrentUser() user: User,
  ): Promise<MonitoredProfile[]> {
    return this.monitoringService.getMonitoredProfiles(user.id, user.tenantId);
  }

  @Query(() => MonitoredProfile)
  async getMonitoredProfile(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ): Promise<MonitoredProfile> {
    return this.monitoringService.getProfile(profileId, user.id, user.tenantId);
  }

  @Query(() => [Tweet])
  async getProfileTweets(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<Tweet[]> {
    // Verify user owns this profile
    await this.monitoringService.getProfile(profileId, user.id, user.tenantId);

    return this.tweetsService.getTweetsByProfile(profileId, limit, offset);
  }

  @Query(() => GraphQLJSON)
  async getProfileStats(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ) {
    return this.monitoringService.getProfileWithStats(
      profileId,
      user.id,
      user.tenantId,
    );
  }

  @Mutation(() => MonitoredProfile)
  async addMonitoredProfile(
    @CurrentUser() user: User,
    @Args('xUsername') xUsername: string,
  ): Promise<MonitoredProfile> {
    const profile = await this.monitoringService.addProfile(
      user.id,
      user.tenantId,
      { xUsername },
    );

    // Invalidate getMonitoredProfiles cache
    await this.cacheManager.del(`${user.id}:getMonitoredProfiles:{}`);

    return profile;
  }

  @Mutation(() => Boolean)
  async removeMonitoredProfile(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ): Promise<boolean> {
    const result = await this.monitoringService.removeProfile(
      user.id,
      user.tenantId,
      profileId,
    );

    // Invalidate caches
    await this.cacheManager.del(`${user.id}:getMonitoredProfiles:{}`);
    await this.cacheManager.del(
      `${user.id}:getMonitoredProfile:{"profileId":"${profileId}"}`,
    );

    return result;
  }

  @Mutation(() => JobIdResponse)
  async refreshProfileTweets(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ): Promise<JobIdResponse> {
    // Verify user owns this profile
    await this.monitoringService.getProfile(profileId, user.id, user.tenantId);

    return this.monitoringService.fetchAndStoreTweets(profileId);
  }
}
