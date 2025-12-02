import { ConfigService } from '@nestjs/config';
import { ConnectionOptions } from 'bullmq';

export interface QueueConfig {
  connection: ConnectionOptions;
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: 'exponential';
      delay: number;
    };
    removeOnComplete: boolean | number;
    removeOnFail: boolean | number;
  };
}

export const getQueueConfig = (configService: ConfigService): QueueConfig => {
  // Get Redis configuration
  let redisHost = configService.get<string>('REDIS_HOST', 'localhost');
  let redisPort = configService.get<number>('REDIS_PORT', 6379);

  // Strip protocol if present (handle URLs like https://31.97.217.52:6379)
  if (redisHost.includes('://')) {
    try {
      const url = new URL(redisHost);
      redisHost = url.hostname;
      if (url.port) {
        redisPort = parseInt(url.port, 10);
      }
    } catch (error) {
      // If URL parsing fails, try to strip protocol manually
      redisHost = redisHost.replace(/^https?:\/\//, '');
      // Extract port if present
      const portMatch = redisHost.match(/:(\d+)$/);
      if (portMatch) {
        redisPort = parseInt(portMatch[1], 10);
        redisHost = redisHost.replace(/:(\d+)$/, '');
      }
    }
  }

  return {
    connection: {
      host: redisHost,
      port: redisPort,
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 seconds
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500, // Keep last 500 failed jobs for debugging
    },
  };
};

// Queue names as constants
export const QUEUE_NAMES = {
  AI_INSIGHTS: 'ai-insights',
  TWEET_MONITORING: 'tweet-monitoring',
  EMAIL_NOTIFICATIONS: 'email-notifications',
  TIKTOK_POLLING: 'tiktok-polling', // Deprecated - use ASYNC_POST_POLLING
  ASYNC_POST_POLLING: 'async-post-polling', // Generic async polling for all platforms
  SCHEDULED_POSTS: 'scheduled-posts',
} as const;

// Job types for AI Insights queue
export const AI_INSIGHTS_JOBS = {
  GENERATE_INSIGHTS: 'generate-insights',
  GENERATE_POST: 'generate-post',
  INDEX_TWEETS: 'index-tweets',
} as const;

// Job types for Tweet Monitoring queue
export const MONITORING_JOBS = {
  FETCH_PROFILE_TWEETS: 'fetch-profile-tweets',
  REFRESH_ALL_PROFILES: 'refresh-all-profiles',
  UPDATE_PROFILE_INFO: 'update-profile-info',
} as const;

// Job types for TikTok Polling queue (Deprecated)
export const TIKTOK_POLLING_JOBS = {
  POLL_STATUS: 'poll-status',
} as const;

// Job types for Async Post Polling queue (Generic for all platforms)
export const ASYNC_POLLING_JOBS = {
  POLL_STATUS: 'poll-status',
} as const;

// Job types for Scheduled Posts queue
export const SCHEDULED_POST_JOBS = {
  PUBLISH_POST: 'publish-post',
} as const;
