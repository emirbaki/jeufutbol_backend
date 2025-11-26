import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { TweetsService } from '../tweets/tweets.service';
import { Rettiwt } from 'rettiwt-api';
import { QUEUE_NAMES, MONITORING_JOBS } from '../queue/queue.config';

export interface AddProfileDto {
  xUsername: string;
  fetchTweets?: boolean;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private rettiwt: Rettiwt;

  // Rate limiting configuration
  // private readonly RATE_LIMIT_DELAY = 5000; // 5 seconds between profile refreshes
  // private readonly MAX_RETRIES = 3; // Maximum retry attempts
  // private readonly INITIAL_BACKOFF_DELAY = 5000; // Initial delay for exponential backoff (5s)

  constructor(
    @InjectRepository(MonitoredProfile)
    private monitoredProfileRepository: Repository<MonitoredProfile>,
    private tweetsService: TweetsService,
    @InjectQueue(QUEUE_NAMES.TWEET_MONITORING)
    private monitoringQueue: Queue,
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
    tenantId: string,
    data: AddProfileDto,
  ): Promise<MonitoredProfile> {
    const username = data.xUsername.replace('@', '');

    // Check if profile already exists for this user
    const existing = await this.monitoredProfileRepository.findOne({
      where: { userId, tenantId, xUsername: username },
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
        tenantId,
        xUsername: username,
        xUserId: profileInfo.id,
        displayName: profileInfo.displayName,
        description: profileInfo.description || null,
        profileImageUrl: profileInfo.profileImage || null,
        followerCount: profileInfo.followersCount || 0,
        isActive: true,
        fetchMetadata: {
          followingCount: profileInfo.followingCount || 0,
          verified: profileInfo.verified || false,
          addedAt: new Date().toISOString(),
        },
      } as DeepPartial<MonitoredProfile>);

      const savedProfile = await this.monitoredProfileRepository.save(profile);
      this.logger.log(
        `Created monitored profile: @${username} (ID: ${savedProfile.id})`,
      );

      // Fetch initial tweets (last 20)
      if (data.fetchTweets !== false) {
        try {
          const fetchCount = parseInt(process.env.TWEET_FETCH_COUNT || '5', 10);
          await this.fetchAndStoreTweets(savedProfile.id, fetchCount);
        } catch (tweetError) {
          this.logger.error(`Failed to fetch tweets: ${tweetError.message}`);
          // Don't fail the entire operation if tweet fetching fails
        }
      }

      return savedProfile;
    } catch (error) {
      this.logger.error(`Error adding profile @${username}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch tweets for a profile (Queue-based)
   */
  async fetchAndStoreTweets(
    profileId: string,
    count: number = 20,
  ): Promise<{ jobId: string }> {
    const job = await this.monitoringQueue.add(
      MONITORING_JOBS.FETCH_PROFILE_TWEETS,
      { profileId, count },
      {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(`Enqueued tweet fetch job ${job.id} for profile ${profileId}`);
    return { jobId: job.id || '' };
  }

  /**
   * Fetch tweets for a profile (Internal - called by processor)
   */
  async fetchAndStoreTweetsInternal(
    profileId: string,
    count: number = 20,
  ): Promise<number> {
    const profile = await this.monitoredProfileRepository.findOne({
      where: { id: profileId },
    });

    if (!profile) {
      this.logger.warn(`Profile ${profileId} not found during background fetch. It may have been deleted.`);
      return 0;
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
      const storedCount = savedTweets.length;

      // Update profile stats
      profile.lastFetchedAt = new Date();
      profile.fetchMetadata = {
        ...profile.fetchMetadata,
        lastFetchCount: storedCount,
        lastFetchStatus: 'success',
        lastFetchTime: new Date().toISOString(),
      };
      await this.monitoredProfileRepository.save(profile);

      this.logger.log(
        `Stored ${storedCount} new tweets for @${profile.xUsername}`,
      );
      return storedCount;
    } catch (error) {
      this.logger.error(
        `Error fetching tweets for @${profile.xUsername}: ${error.message}`,
      );

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
  async removeProfile(userId: string, tenantId: string, profileId: string): Promise<boolean> {
    const profile = await this.monitoredProfileRepository.findOne({
      where: { id: profileId, userId, tenantId },
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
  async getMonitoredProfiles(userId: string, tenantId: string): Promise<MonitoredProfile[]> {
    // Get ALL profiles from the organization (shared watchlist)
    return this.monitoredProfileRepository.find({
      where: { tenantId, isActive: true },
      order: { createdAt: 'DESC' },
      relations: ['user'], // Include user relation to show who added each profile
    });
  }

  /**
   * Get a single monitored profile
   */
  async getProfile(
    profileId: string,
    userId: string,
    tenantId: string,
  ): Promise<MonitoredProfile> {
    const profile = await this.monitoredProfileRepository.findOne({
      where: { id: profileId, userId, tenantId },
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
   * Refresh tweets for all active profiles (Queue-based)
   */
  async refreshAllProfiles(): Promise<{ jobId: string }> {
    const job = await this.monitoringQueue.add(
      MONITORING_JOBS.REFRESH_ALL_PROFILES,
      {},
      {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(`Enqueued refresh all profiles job ${job.id}`);
    return { jobId: job.id || '' };
  }

  /**
   * Refresh tweets for all active profiles (Internal - called by processor)
   * Enqueues individual fetch jobs for each profile
   */
  async refreshAllProfilesInternal(): Promise<number> {
    const profiles = await this.monitoredProfileRepository.find({
      where: { isActive: true },
    });

    this.logger.log(`Scheduling refresh for ${profiles.length} profiles`);

    let enqueuedCount = 0;
    const STAGGER_DELAY_MS = 100; // Minimal delay between enqueuing jobs

    for (const profile of profiles) {
      // Enqueue fetch job for each profile
      // Use configured fetch count or default to 5 to save bandwidth
      const fetchCount = parseInt(process.env.TWEET_FETCH_COUNT || '20', 10);
      await this.fetchAndStoreTweets(profile.id, fetchCount);
      enqueuedCount++;

      // Add minimal delay to prevent overwhelming Redis
      if (enqueuedCount < profiles.length) {
        await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS));
      }
    }

    this.logger.log(`Enqueued ${enqueuedCount} profile refresh jobs`);
    return enqueuedCount;
  }

  /**
   * Get profile with tweet statistics
   */
  async getProfileWithStats(
    profileId: string,
    userId: string,
    tenantId: string,
  ): Promise<{
    profile: MonitoredProfile;
    stats: any;
  }> {
    const profile = await this.getProfile(profileId, userId, tenantId);
    const stats = await this.tweetsService.getTweetStats(profileId);

    return { profile, stats };
  }
}
