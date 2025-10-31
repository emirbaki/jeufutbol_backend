import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
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
  ) {}

  /**
   * Get user profile info from Twitter
   */
  async getUserProfile(username: string): Promise<{
    id: string;
    username: string;
    displayName: string;
    description?: string;
    profileImage?: string;
    followersCount?: number;
    followingCount?: number;
    verified?: boolean;
  }> {
    try {
      this.logger.log(`Fetching profile info for @${username}`);

      const userDetails = await this.rettiwt.user.details(username);

      return {
        id: userDetails!.id,
        username: userDetails!.userName,
        displayName: userDetails!.fullName || userDetails!.userName,
        description: userDetails!.description || '',
        profileImage: userDetails!.profileImage,
        followersCount: userDetails!.followersCount || 0,
        followingCount: userDetails!.followingsCount || 0,
        verified: userDetails!.isVerified || false,
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

      this.logger.log(`Profile info fetched: ${JSON.stringify(profileInfo)}`);

      // Create monitored profile with proper field mapping
      const profile = this.monitoredProfileRepository.create({
        userId,
        xUsername: username,
        xUserId: profileInfo.id,
        displayName: profileInfo.displayName,
        description: profileInfo.description || null,
        profileImageUrl: profileInfo.profileImage || null,
        followerCount: profileInfo.followersCount || 0, // ✅ Map to column
        isActive: true,
        fetchMetadata: {
          followingCount: profileInfo.followingCount || 0,
          verified: profileInfo.verified || false,
          addedAt: new Date().toISOString(),
        },
      } as DeepPartial<MonitoredProfile>);

      this.logger.log(
        `Creating profile with data: ${JSON.stringify({
          username: profile.xUsername,
          displayName: profile.displayName,
          followerCount: profile.followerCount,
        })}`,
      );

      const savedProfile = await this.monitoredProfileRepository.save(profile);
      this.logger.log(
        `Created monitored profile: @${username} (ID: ${savedProfile[0].id})`,
      );

      // Fetch initial tweets (last 20)
      if (data.fetchTweets !== false) {
        try {
          await this.fetchAndStoreTweets(savedProfile[0].id);
        } catch (tweetError) {
          this.logger.error(`Failed to fetch tweets: ${tweetError.message}`);
          // Don't fail the entire operation if tweet fetching fails
        }
      }

      return savedProfile[0];
    } catch (error) {
      this.logger.error(`Error adding profile @${username}: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
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

      if (!rettiwtTweets || rettiwtTweets.length === 0) {
        this.logger.warn(`No tweets found for @${profile.xUsername}`);
        return 0;
      }

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
        lastFetchTime: new Date().toISOString(),
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
      this.logger.error(`Stack trace: ${error.stack}`);

      // Update error status
      profile.fetchMetadata = {
        ...profile.fetchMetadata,
        lastFetchStatus: 'error',
        lastFetchError: error.message,
        lastFetchTime: new Date().toISOString(),
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
   * Update profile information from Twitter
   */
  async updateProfileInfo(profileId: string): Promise<MonitoredProfile> {
    const profile = await this.monitoredProfileRepository.findOne({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    try {
      const profileInfo = await this.getUserProfile(profile.xUsername);

      profile.displayName = profileInfo.displayName;
      profile.description = profileInfo.description!;
      profile.profileImageUrl = profileInfo.profileImage!;
      profile.followerCount = profileInfo.followersCount || 0;
      profile.fetchMetadata = {
        ...profile.fetchMetadata,
        followingCount: profileInfo.followingCount || 0,
        verified: profileInfo.verified || false,
        lastProfileUpdate: new Date().toISOString(),
      };

      return this.monitoredProfileRepository.save(profile);
    } catch (error) {
      this.logger.error(`Failed to update profile info: ${error.message}`);
      throw error;
    }
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

      // Add delay to avoid rate limiting
      await this.delay(2000); // 2 second delay between requests
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

  /**
   * Helper: Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
