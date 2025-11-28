import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Tweet } from '../entities/tweet.entity';

import { Rettiwt } from 'rettiwt-api';
import { Tweet as RettiwtTweet } from 'rettiwt-api';

// interface RettiwtUser {
//   id: string;
//   userName: string;
//   fullName: string;
//   profileImage?: string;
// }

const API_KEY: string = process.env.RETTIWT_API_KEY || '';

@Injectable()
export class TweetsService {
  private readonly logger = new Logger(TweetsService.name);

  public rettiwt: Rettiwt;

  private proxies: string[] = [];
  private currentProxyIndex = 0;

  constructor(
    @InjectRepository(Tweet)
    private tweetRepository: Repository<Tweet>,
  ) {
    // Initialize proxies from env
    const proxyList = process.env.TWITTER_PROXY_LIST || '';
    if (proxyList) {
      this.proxies = proxyList.split(',').map((p) => p.trim()).filter((p) => p);
      this.logger.log(`Loaded ${this.proxies.length} proxies`);
      // Randomize start index to avoid all workers hitting the same bad proxy first
      this.currentProxyIndex = Math.floor(Math.random() * this.proxies.length);
    }

    // Initialize Rettiwt-API (default instance)
    this.rettiwt = this.createRettiwtInstance();
    this.logger.log('Rettiwt-API initialized');
  }

  /**
   * Create a Rettiwt instance, optionally with a proxy
   */
  private createRettiwtInstance(proxyUrl?: string): Rettiwt {
    const config: any = { apiKey: API_KEY };
    if (proxyUrl) {
      try {
        config.proxyUrl = new URL(proxyUrl);
        this.logger.log(`Created Rettiwt instance with proxy: ${proxyUrl}`);
      } catch (e) {
        this.logger.warn(`Invalid proxy URL: ${proxyUrl}`);
      }
    }
    return new Rettiwt(config);
  }

  /**
   * Get next proxy from the list
   */
  private getNextProxy(): string | undefined {
    if (this.proxies.length === 0) return undefined;

    const proxy = this.proxies[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  /**
   * Fetch tweets from Twitter using Rettiwt-API
   * Includes retry logic for 429 errors and proxy rotation
   */
  async fetchTweetsFromTwitter(
    username: string,
    count: number = 20,
  ): Promise<RettiwtTweet[]> {
    const MAX_RETRIES = 10; // Increased for unreliable free proxies
    let attempt = 0;
    let currentRettiwt = this.rettiwt;

    // Try to use a proxy for the first attempt if available
    if (this.proxies.length > 0) {
      const proxy = this.getNextProxy();
      if (proxy) {
        currentRettiwt = this.createRettiwtInstance(proxy);
      }
    }

    while (attempt < MAX_RETRIES) {
      try {
        this.logger.log(
          `Fetching ${count} tweets for @${username} (Attempt ${attempt + 1}/${MAX_RETRIES})`,
        );

        // Fetch user's tweets
        const response = await currentRettiwt.tweet.search(
          {
            fromUsers: [username],
          },
          count,
        );

        const tweets = response.list || [];
        this.logger.log(`Fetched ${tweets.length} tweets for @${username}`);

        return tweets;
      } catch (error) {
        // Log the full error for debugging
        this.logger.error(
          `Error fetching tweets for @${username} (Attempt ${attempt + 1}): ${error.message}`,
        );
        if (error.stack) this.logger.debug(error.stack);

        // Check for rate limit (429) or other proxy/network errors
        // We should rotate proxy on almost any error to be safe, as free proxies are unreliable
        // 400: Bad Request (often proxy related)
        // 403: Forbidden (often proxy/geo related)
        // 407: Proxy Auth Required
        // 5xx: Server errors
        // TypeError: Often happens when rettiwt fails to parse a non-JSON error response from a bad proxy
        const isProxyError = error instanceof TypeError && error.message?.includes("reading 'errors'");
        const isAuthError = error.status === 407 || error.statusCode === 407;

        const isRetryable =
          isProxyError ||
          isAuthError ||
          error.message?.includes('429') ||
          error.status === 429 ||
          error.statusCode === 429 ||
          error.status === 400 ||
          error.statusCode === 400 ||
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT';

        if (isRetryable || this.proxies.length > 0) {
          attempt++;
          if (attempt >= MAX_RETRIES) {
            this.logger.error(
              `Max retries reached for @${username}. Giving up.`,
            );
            throw new Error(
              `Failed to fetch tweets after ${MAX_RETRIES} attempts: ${error.message}`,
            );
          }

          if (isProxyError) {
            this.logger.warn(`Proxy returned invalid response for @${username}. Rotating proxy.`);
          } else if (isAuthError) {
            this.logger.warn(`Proxy authentication failed (407) for @${username}. Rotating proxy.`);
          } else {
            this.logger.warn(`Encountered error for @${username}. Rotating proxy if available.`);
          }

          // If we have proxies, switch to the next one immediately
          if (this.proxies.length > 0) {
            const nextProxy = this.getNextProxy();
            if (nextProxy) {
              this.logger.log(`Switching to next proxy: ${nextProxy}`);
              currentRettiwt = this.createRettiwtInstance(nextProxy);
              // Don't wait long if we switched proxy
              await this.sleep(1000);
              continue;
            }
          }

          // Fallback: Exponential backoff if no proxies or proxy failed
          const delaySeconds = 60 * attempt;
          this.logger.warn(
            `Waiting ${delaySeconds} seconds before retry...`,
          );
          await this.sleep(delaySeconds * 1000);
          continue;
        }

        // For other non-retryable errors (if any), throw immediately
        throw new Error(`Failed to fetch tweets: ${error.message}`);
      }
    }

    return [];
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convert Rettiwt Tweet to our Tweet entity
   */
  convertRettiwtTweetToEntity(
    rettiwtTweet: RettiwtTweet,
    monitoredProfileId: string,
  ): Tweet {
    const tweet = new Tweet();

    // Basic fields
    tweet.monitoredProfileId = monitoredProfileId;
    tweet.tweetId = rettiwtTweet.id;
    tweet.content = rettiwtTweet.fullText || '';
    tweet.createdAt = rettiwtTweet.createdAt
      ? new Date(rettiwtTweet.createdAt)
      : new Date();

    // Engagement metrics
    tweet.likes = rettiwtTweet.likeCount || 0;
    tweet.retweets = rettiwtTweet.retweetCount || 0;
    tweet.replies = rettiwtTweet.replyCount || 0;
    tweet.views = rettiwtTweet.viewCount || 0;

    // Media URLs
    tweet.mediaUrls = this.extractMediaUrls(rettiwtTweet);

    // Hashtags
    tweet.hashtags = this.extractHashtags(rettiwtTweet);

    // Mentions
    tweet.mentions = this.extractMentions(rettiwtTweet);

    // URLs
    tweet.urls = this.extractUrls(rettiwtTweet);

    // Store raw data for debugging
    tweet.rawData = this.sanitizeRawData(rettiwtTweet);

    return tweet;
  }

  /**
   * Extract media URLs from Rettiwt tweet
   */
  private extractMediaUrls(tweet: RettiwtTweet): string[] {
    const mediaUrls: string[] = [];

    if (tweet.media && Array.isArray(tweet.media)) {
      tweet.media.forEach((media: any) => {
        if (media.type === 'photo' && media.url) {
          mediaUrls.push(media.url);
        } else if (media.type === 'video' && media.variants) {
          // Get highest quality video
          const highestQuality = media.variants
            .filter((v: any) => v.bitrate)
            .sort((a: any, b: any) => b.bitrate - a.bitrate)[0];

          if (highestQuality?.url) {
            mediaUrls.push(highestQuality.url);
          }
        }
      });
    }

    return mediaUrls;
  }

  /**
   * Extract hashtags from tweet text
   */
  private extractHashtags(tweet: RettiwtTweet): string[] {
    const text = tweet.fullText || '';
    const hashtagRegex = /#(\w+)/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map((tag) => tag.substring(1)) : [];
  }

  /**
   * Extract mentions from tweet
   */
  private extractMentions(tweet: RettiwtTweet): string[] {
    const mentions: string[] = [];

    if (
      tweet.entities?.mentionedUsers &&
      Array.isArray(tweet.entities.mentionedUsers)
    ) {
      tweet.entities.mentionedUsers.forEach((mention: any) => {
        if (mention.username) {
          mentions.push(mention.username);
        }
      });
    }

    return mentions;
  }

  /**
   * Extract URLs from tweet
   */
  private extractUrls(tweet: RettiwtTweet): string[] {
    const urls: string[] = [];

    if (tweet.entities?.urls && Array.isArray(tweet.entities.urls)) {
      tweet.entities.urls.forEach((url: any) => {
        if (url.expandedUrl) {
          urls.push(url.expandedUrl);
        } else if (url.url) {
          urls.push(url.url);
        }
      });
    }

    return urls;
  }

  /**
   * Sanitize raw data to prevent circular references
   */
  private sanitizeRawData(tweet: RettiwtTweet): any {
    try {
      return JSON.parse(JSON.stringify(tweet));
    } catch (error) {
      this.logger.warn('Failed to sanitize raw data, storing minimal info');
      return {
        id: tweet.id,
        fullText: tweet.fullText,
        createdAt: tweet.createdAt,
      };
    }
  }

  /**
   * Save tweets to database
   */
  async saveTweets(tweets: Tweet[]): Promise<Tweet[]> {
    if (tweets.length === 0) {
      return [];
    }

    try {
      // Check which tweets already exist
      const tweetIds = tweets.map((t) => t.tweetId);
      const existingTweets = await this.tweetRepository.find({
        where: { tweetId: In(tweetIds) },
      });

      const existingTweetIds = new Set(existingTweets.map((t) => t.tweetId));
      const newTweets = tweets.filter((t) => !existingTweetIds.has(t.tweetId));

      if (newTweets.length > 0) {
        const saved = await this.tweetRepository.save(newTweets);
        this.logger.log(`Saved ${saved.length} new tweets`);
        return saved;
      }

      this.logger.log('No new tweets to save');
      return [];
    } catch (error) {
      this.logger.error(`Error saving tweets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get tweets for a monitored profile
   */
  async getTweetsByProfile(
    monitoredProfileId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Tweet[]> {
    return this.tweetRepository.find({
      where: { monitoredProfileId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get recent tweets (last N days)
   */
  async getRecentTweets(
    monitoredProfileId: string,
    days: number = 7,
  ): Promise<Tweet[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.tweetRepository
      .createQueryBuilder('tweet')
      .where('tweet.monitoredProfileId = :profileId', {
        profileId: monitoredProfileId,
      })
      .andWhere('tweet.createdAt >= :since', { since })
      .orderBy('tweet.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Get tweets by IDs
   */
  async getTweetsByIds(tweetIds: string[]): Promise<Tweet[]> {
    return this.tweetRepository.find({
      where: { id: In(tweetIds) },
    });
  }

  /**
   * Update tweet metrics (for refreshing engagement data)
   */
  async updateTweetMetrics(
    tweetId: string,
    metrics: {
      likes?: number;
      retweets?: number;
      replies?: number;
      views?: number;
    },
  ): Promise<Tweet> {
    const tweet = await this.tweetRepository.findOne({
      where: { tweetId },
    });

    if (!tweet) {
      throw new Error(`Tweet ${tweetId} not found`);
    }

    if (metrics.likes !== undefined) tweet.likes = metrics.likes;
    if (metrics.retweets !== undefined) tweet.retweets = metrics.retweets;
    if (metrics.replies !== undefined) tweet.replies = metrics.replies;
    if (metrics.views !== undefined) tweet.views = metrics.views;

    return this.tweetRepository.save(tweet);
  }

  /**
   * Delete old tweets (cleanup)
   */
  async deleteOldTweets(days: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.tweetRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Deleted ${result.affected} old tweets`);
    return result.affected || 0;
  }

  /**
   * Get tweet statistics for a profile
   */
  async getTweetStats(monitoredProfileId: string): Promise<{
    totalTweets: number;
    avgLikes: number;
    avgRetweets: number;
    avgReplies: number;
    avgViews: number;
    topHashtags: { tag: string; count: number }[];
  }> {
    const tweets = await this.getTweetsByProfile(monitoredProfileId, 1000);

    const totalTweets = tweets.length;
    const avgLikes =
      tweets.reduce((sum, t) => sum + t.likes, 0) / totalTweets || 0;
    const avgRetweets =
      tweets.reduce((sum, t) => sum + t.retweets, 0) / totalTweets || 0;
    const avgReplies =
      tweets.reduce((sum, t) => sum + t.replies, 0) / totalTweets || 0;
    const avgViews =
      tweets.reduce((sum, t) => sum + t.views, 0) / totalTweets || 0;

    // Count hashtags
    const hashtagCounts = new Map<string, number>();
    tweets.forEach((tweet) => {
      tweet.hashtags?.forEach((tag) => {
        hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
      });
    });

    const topHashtags = Array.from(hashtagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalTweets,
      avgLikes: Math.round(avgLikes),
      avgRetweets: Math.round(avgRetweets),
      avgReplies: Math.round(avgReplies),
      avgViews: Math.round(avgViews),
      topHashtags,
    };
  }
}
