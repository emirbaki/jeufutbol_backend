import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { TweetsService } from '../tweets/tweets.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Tweet } from '../entities/tweet.entity';
import GraphQLJSON from 'graphql-type-json';

@Resolver()
@UseGuards(GqlAuthGuard)
export class MonitoringResolver {
  constructor(
    private monitoringService: MonitoringService,
    private tweetsService: TweetsService,
  ) { }

  @Query(() => [MonitoredProfile])
  async getMonitoredProfiles(
    @CurrentUser() user: User,
  ): Promise<MonitoredProfile[]> {
    return this.monitoringService.getMonitoredProfiles(user.id);
  }

  @Query(() => MonitoredProfile)
  async getMonitoredProfile(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ): Promise<MonitoredProfile> {
    return this.monitoringService.getProfile(profileId, user.id);
  }

  @Query(() => [Tweet])
  async getProfileTweets(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<Tweet[]> {
    // Verify user owns this profile
    await this.monitoringService.getProfile(profileId, user.id);

    return this.tweetsService.getTweetsByProfile(profileId, limit, offset);
  }

  @Query(() => GraphQLJSON)
  async getProfileStats(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ) {
    return this.monitoringService.getProfileWithStats(profileId, user.id);
  }

  @Mutation(() => MonitoredProfile)
  async addMonitoredProfile(
    @CurrentUser() user: User,
    @Args('xUsername') xUsername: string,
  ): Promise<MonitoredProfile> {
    return this.monitoringService.addProfile(user.id, { xUsername });
  }

  @Mutation(() => Boolean)
  async removeMonitoredProfile(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ): Promise<boolean> {
    return this.monitoringService.removeProfile(user.id, profileId);
  }

  @Mutation(() => Int)
  async refreshProfileTweets(
    @CurrentUser() user: User,
    @Args('profileId') profileId: string,
  ): Promise<number> {
    // Verify user owns this profile
    await this.monitoringService.getProfile(profileId, user.id);

    return this.monitoringService.fetchAndStoreTweets(profileId);
  }
}
