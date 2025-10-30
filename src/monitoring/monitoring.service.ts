import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { TweetsService } from '../tweets/tweets.service';
import { Rettiwt } from 'rettiwt-api';

export interface AddProfileDto {
  xUsername: string;
  fetchTweets?: boolean;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private rettiwt: Rettiwt;

  constructor(
    @InjectRepository(MonitoredProfile)
    private monitoredProfileRepository: Repository<MonitoredProfile>,
    private tweetsService: TweetsService,
  ) {
    this.rettiwt = tweetsService.rettiwt;
  }

  /**
   * Get user profile info from Twitter
   */
  async getUserProfile(username: string): Promise<{
    id: string;
    username: string;
    displayName: string;
    profileImage?: string;
    description?: string;
    followersCount?: number;
    followingCount?: number;
  }> {
    try {
      this.logger.log(`Fetching profile info for @${username}`);

      const userDetails = await this.rettiwt.user.details(username);

      return {
        id: userDetails!.id,
        username: userDetails!.userName,
        displayName: userDetails!.fullName,
        profileImage: userDetails!.profileImage,
        description: userDetails!.description,
        followersCount: userDetails!.followersCount,
        followingCount: userDetails!.followingsCount,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching profile for @${username}: ${error.message}`,
      );
      throw new Error(`Failed to fetch profile: ${error.message}`);
    }
  }

  /**
   * Add a new monitored profile
   */
  async addProfile(
    userId: string,
    data: AddProfileDto,
  ): Promise<MonitoredProfile> {
    const username = data.xUsername.replace('@', '');

    // Check if profile already exists for this user
    const existing = await this.monitoredProfileRepository.findOne({
      where: { userId, xUsername: username },
    });

    if (existing) {
      this.logger.log(`Profile @${username} already exists for user ${userId}`);

      // Reactivate if it was deactivated
      if (!existing.isActive) {
        existing.isActive = true;
        await this.monitoredProfileRepository.save(existing);
      }

      // Fetch latest tweets if requested
      if (data.fetchTweets !== false) {
        await this.fetchAndStoreTweets(existing.id);
      }

      return existing;
    }

    try {
      // Fetch profile info from Twitter
      const profileInfo = await this.getUserProfile(username);

      // Create monitored profile
      const profile = this.monitoredProfileRepository.create({
        userId,
        xUsername: username,
        xUserId: profileInfo.id,
        displayName: profileInfo.displayName,
        profileImageUrl: profileInfo.profileImage,
        isActive: true,
        fetchMetadata: {
          description: profileInfo.description,
          followersCount: profileInfo.followersCount,
          followingCount: profileInfo.followingCount,
          addedAt: new Date(),
        },
      });

      const savedProfile = await this.monitoredProfileRepository.save(profile);
      this.logger.log(`Created monitored profile: @${username}`);

      // Fetch initial tweets (last 20)
      if (data.fetchTweets !== false) {
        await this.fetchAndStoreTweets(savedProfile.id);
      }

      return savedProfile;
    } catch (error) {
      this.logger.error(`Error adding profile @${username}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch and store tweets for a monitored profile
   */
  async fetchAndStoreTweets(
    profileId: string,
    count: number = 20,
  ): Promise<number> {
    const profile = await this.monitoredProfileRepository.findOne({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Check if we should fetch (don't fetch more than once per hour)
    if (profile.lastFetchedAt) {
      const hoursSinceLastFetch =
        (Date.now() - profile.lastFetchedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastFetch < 1) {
        this.logger.log(
          `Skipping fetch for @${profile.xUsername} - fetched ${hoursSinceLastFetch.toFixed(1)} hours ago`,
        );
        return 0;
      }
    }

    try {
      this.logger.log(`Fetching ${count} tweets for @${profile.xUsername}`);

      // Fetch tweets from Twitter
      const rettiwtTweets = await this.tweetsService.fetchTweetsFromTwitter(
        profile.xUsername,
        count,
      );

      // Convert to our Tweet entities
      const tweets = rettiwtTweets.map((rt) =>
        this.tweetsService.convertRettiwtTweetToEntity(rt, profile.id),
      );

      // Save to database
      const savedTweets = await this.tweetsService.saveTweets(tweets);

      // Update last fetched time
      profile.lastFetchedAt = new Date();
      profile.fetchMetadata = {
        ...profile.fetchMetadata,
        lastFetchCount: savedTweets.length,
        lastFetchStatus: 'success',
        totalTweetsFetched:
          (profile.fetchMetadata?.totalTweetsFetched || 0) + savedTweets.length,
      };
      await this.monitoredProfileRepository.save(profile);

      this.logger.log(
        `Fetched and saved ${savedTweets.length} tweets for @${profile.xUsername}`,
      );

      return savedTweets.length;
    } catch (error) {
      this.logger.error(
        `Error fetching tweets for @${profile.xUsername}: ${error.message}`,
      );

      // Update error status
      profile.fetchMetadata = {
        ...profile.fetchMetadata,
        lastFetchStatus: 'error',
        lastFetchError: error.message,
      };
      await this.monitoredProfileRepository.save(profile);

      throw error;
    }
  }

  /**
   * Remove a monitored profile
   */
  async removeProfile(userId: string, profileId: string): Promise<boolean> {
    const profile = await this.monitoredProfileRepository.findOne({
      where: { id: profileId, userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Soft delete by deactivating
    profile.isActive = false;
    await this.monitoredProfileRepository.save(profile);

    this.logger.log(`Deactivated profile: @${profile.xUsername}`);
    return true;
  }

  /**
   * Get all monitored profiles for a user
   */
  async getMonitoredProfiles(userId: string): Promise<MonitoredProfile[]> {
    return this.monitoredProfileRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a single monitored profile
   */
  async getProfile(
    profileId: string,
    userId: string,
  ): Promise<MonitoredProfile> {
    const profile = await this.monitoredProfileRepository.findOne({
      where: { id: profileId, userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  /**
   * Refresh tweets for all active profiles
   */
  async refreshAllProfiles(): Promise<{ success: number; failed: number }> {
    const profiles = await this.monitoredProfileRepository.find({
      where: { isActive: true },
    });

    this.logger.log(`Refreshing tweets for ${profiles.length} profiles`);

    let success = 0;
    let failed = 0;

    for (const profile of profiles) {
      try {
        await this.fetchAndStoreTweets(profile.id);
        success++;
      } catch (error) {
        this.logger.error(
          `Failed to refresh @${profile.xUsername}: ${error.message}`,
        );
        failed++;
      }
    }

    this.logger.log(`Refresh complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Get profile with tweet statistics
   */
  async getProfileWithStats(
    profileId: string,
    userId: string,
  ): Promise<{
    profile: MonitoredProfile;
    stats: any;
  }> {
    const profile = await this.getProfile(profileId, userId);
    const stats = await this.tweetsService.getTweetStats(profileId);

    return { profile, stats };
  }
}
