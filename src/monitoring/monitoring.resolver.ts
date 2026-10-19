import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards, UseInterceptors, Inject } from '@nestjs/common';
import {
  CacheInterceptor,
  CacheTTL,
  CACHE_MANAGER,
} from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { GraphqlCacheInterceptor, graphqlCacheKey } from '../cache/graphql-cache.interceptor';
import { ActiveWorkspace } from '../workspaces/active-workspace.decorator';
import { Workspace } from '../entities/workspace.entity';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { MonitoringService } from './monitoring.service';
import { TweetsService } from '../tweets/tweets.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Tweet } from '../entities/tweet.entity';
import GraphQLJSON from 'graphql-type-json';
import { JobIdResponse } from '../insights/types/job-response.types';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { ApiKeyScope } from '../auth/api-key-scopes.enum';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKey } from '../entities/api-key.entity';

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
@UseInterceptors(GraphqlCacheInterceptor)
export class MonitoringResolver {
  constructor(
    private monitoringService: MonitoringService,
    private tweetsService: TweetsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private accessService: WorkspaceAccessService,
  ) { }

  @Query(() => [MonitoredProfile])
  @RequireScopes(ApiKeyScope.MONITORING_READ)
  async getMonitoredProfiles(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @ActiveWorkspace() workspace?: Workspace,
  ): Promise<MonitoredProfile[]> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.monitoringService.getMonitoredProfiles(userId, tenantId, workspace!.id);
  }

  @Query(() => MonitoredProfile)
  @RequireScopes(ApiKeyScope.MONITORING_READ)
  async getMonitoredProfile(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('profileId') profileId: string,
  ): Promise<MonitoredProfile> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.loadProfile(profileId, user, apiKey);
  }

  @Query(() => [Tweet])
  @RequireScopes(ApiKeyScope.MONITORING_READ)
  async getProfileTweets(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('profileId') profileId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<Tweet[]> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    // Verify the caller reaches the profile's branch
    await this.loadProfile(profileId, user, apiKey);

    return this.tweetsService.getTweetsByProfile(profileId, limit, offset);
  }

  @Query(() => [Tweet])
  @RequireScopes(ApiKeyScope.MONITORING_READ)
  async getTimelineTweets(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
    @ActiveWorkspace() workspace?: Workspace,
  ): Promise<Tweet[]> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.monitoringService.getTimelineTweets(userId, tenantId, limit, offset, workspace!.id);
  }

  @Query(() => GraphQLJSON)
  @RequireScopes(ApiKeyScope.MONITORING_READ)
  async getProfileStats(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('profileId') profileId: string,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    await this.loadProfile(profileId, user, apiKey);
    return this.monitoringService.getProfileWithStats(
      profileId,
      userId,
      tenantId,
    );
  }

  @Mutation(() => MonitoredProfile)
  @RequireScopes(ApiKeyScope.MONITORING_WRITE)
  async addMonitoredProfile(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('xUsername') xUsername: string,
    @ActiveWorkspace() workspace?: Workspace,
  ): Promise<MonitoredProfile> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    const profile = await this.monitoringService.addProfile(
      userId,
      tenantId,
      { xUsername },
      workspace!.id,
    );

    // Invalidate getMonitoredProfiles cache of the profile's workspace
    if (profile.workspaceId) {
      await this.cacheManager.del(graphqlCacheKey(tenantId, profile.workspaceId, 'getMonitoredProfiles'));
    }

    return profile;
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.MONITORING_WRITE)
  async removeMonitoredProfile(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('profileId') profileId: string,
  ): Promise<boolean> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    // Read the workspace before the profile goes away
    const { workspaceId } = await this.loadProfile(profileId, user, apiKey);
    const result = await this.monitoringService.removeProfile(
      userId,
      tenantId,
      profileId,
    );

    // Invalidate caches
    if (workspaceId) {
      await this.cacheManager.del(graphqlCacheKey(tenantId, workspaceId, 'getMonitoredProfiles'));
      await this.cacheManager.del(graphqlCacheKey(tenantId, workspaceId, 'getMonitoredProfile', { profileId }));
    }

    return result;
  }

  @Mutation(() => JobIdResponse)
  @RequireScopes(ApiKeyScope.MONITORING_WRITE)
  async refreshProfileTweets(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('profileId') profileId: string,
  ): Promise<JobIdResponse> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    // Verify the caller reaches the profile's branch
    await this.loadProfile(profileId, user, apiKey);

    return this.monitoringService.fetchAndStoreTweets(profileId);
  }

  /** Loads a profile of the tenant and checks that the caller reaches its branch. */
  private async loadProfile(profileId: string, user: User, apiKey: ApiKey): Promise<MonitoredProfile> {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    const profile = await this.monitoringService.getProfile(profileId, userId, tenantId);
    this.accessService.assertRow(await this.accessService.accessFor(user, apiKey), profile.workspaceId, 'Monitored profile');
    return profile;
  }
}
