import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AsyncPostGateway, AsyncPollingJobData, AsyncPublishStatus } from './async-post.gateway';
import { PlatformType } from 'src/enums/platform-type.enum';
import { isVideoFile } from '../utils/media-utils';
import { PlatformAnalyticsResponse } from 'src/graphql/types/analytics.type';
import { YouTubeChannelInfo, YouTubePostSettingsInput } from 'src/graphql/types/youtube.type';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

// YouTube Shorts max duration in seconds (3 minutes as of Oct 2024)
const SHORTS_MAX_DURATION_SECONDS = 180;

/**
 * Extended options for YouTube posting with user-selected settings
 */
export interface YouTubePostOptions {
    username?: string;
    youtubeSettings?: YouTubePostSettingsInput;
}

@Injectable()
export class YoutubePostGateway extends AsyncPostGateway {
    private readonly logger = new Logger(YoutubePostGateway.name);

    async notifyPostPublished(
        postId: string,
        platform: PlatformType,
        publishedPostData: any,
    ): Promise<void> {
        this.logger.log(`[YouTube] Video published: ${postId}`);
    }

    async notifyPostScheduled(
        postId: string,
        scheduledFor: string,
    ): Promise<void> {
        this.logger.log(`[YouTube] Video scheduled for: ${scheduledFor}`);
    }

    async notifyPostFailed(postId: string, error: string): Promise<void> {
        this.logger.error(`[YouTube] Video failed: ${error}`);
    }

    /**
     * Get channel info from YouTube API
     * Used to fetch user's channel details after OAuth
     * @param access_token OAuth access token
     */
    async getChannelInfo(access_token: string): Promise<YouTubeChannelInfo> {
        try {
            this.logger.log('[YouTube] Fetching channel info...');

            const response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
                params: {
                    part: 'snippet,statistics',
                    mine: true,
                },
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            });

            const channel = response.data.items?.[0];
            if (!channel) {
                throw new Error('No YouTube channel found for this account');
            }

            this.logger.log(`[YouTube] Channel info: ${channel.snippet.title}`);

            return {
                channel_id: channel.id,
                channel_title: channel.snippet.title,
                channel_thumbnail: channel.snippet.thumbnails?.default?.url,
                subscriber_count: parseInt(channel.statistics.subscriberCount) || 0,
            };
        } catch (err: any) {
            this.logger.error(
                `[YouTube] Failed to fetch channel info: ${JSON.stringify(err.response?.data, null, 2) || err.message}`,
            );
            throw err;
        }
    }

    /**
     * Create YouTube video post
     * @param userId User ID (internal)
     * @param content Video description from post (fallback)
     * @param access_token OAuth access token
     * @param media Array of media URLs (first video will be used)
     * @param options YouTube-specific options including user settings
     */
    async createNewPost(
        userId: string,
        content: string,
        access_token: string,
        media?: string[],
        options?: YouTubePostOptions,
    ): Promise<any> {
        try {
            if (!media || media.length === 0) {
                throw new Error('YouTube requires a video file');
            }

            // Get first video file
            const videoUrl = media.find((url) => isVideoFile(url));
            if (!videoUrl) {
                throw new Error('YouTube requires a video file (no valid video found in media)');
            }

            const settings = options?.youtubeSettings;

            // Build title - YouTube detects Shorts automatically based on aspect ratio/duration
            const title = settings?.title || 'Untitled Video';

            // Use post content as video description
            const description = content || '';

            // Privacy status - default to public
            const privacyStatus = settings?.privacy_status || 'public';

            this.logger.log(`[YouTube] Starting video upload: "${title}" (privacy: ${privacyStatus})`);

            // Step 1: Initiate resumable upload session
            const sessionUri = await this.initiateResumableUpload(
                access_token,
                title,
                description,
                privacyStatus,
                settings?.category_id || '22', // Default: People & Blogs
                settings?.tags || [],
                settings?.made_for_kids || false,
                settings?.notify_subscribers ?? true,
            );

            // Step 2: Download video and upload to session
            const videoId = await this.uploadVideoToSession(
                sessionUri,
                videoUrl,
                access_token,
            );

            this.logger.log(`[YouTube] Video upload initiated, ID: ${videoId}`);

            // Return video info for async polling
            return {
                id: videoId,
                url: null, // URL will be set when processing completes
                publish_id: videoId,
            };
        } catch (err: any) {
            this.logger.error(`[YouTube] Publishing failed: ${err.message}`);
            await this.notifyPostFailed('unknown', err.message);
            throw err;
        }
    }

    /**
     * Initiate a resumable upload session with YouTube
     */
    private async initiateResumableUpload(
        access_token: string,
        title: string,
        description: string,
        privacyStatus: string,
        categoryId: string,
        tags: string[],
        madeForKids: boolean,
        notifySubscribers: boolean,
    ): Promise<string> {
        try {
            const videoMetadata = {
                snippet: {
                    title: title.substring(0, 100), // Max 100 chars for title
                    description: description.substring(0, 5000), // Max 5000 chars
                    tags: tags.slice(0, 500), // Max 500 tags
                    categoryId: categoryId,
                },
                status: {
                    privacyStatus: privacyStatus,
                    selfDeclaredMadeForKids: madeForKids,
                },
            };

            const response = await axios.post(
                `${YOUTUBE_UPLOAD_BASE}/videos`,
                videoMetadata,
                {
                    params: {
                        uploadType: 'resumable',
                        part: 'snippet,status',
                        notifySubscribers: notifySubscribers,
                    },
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                        'Content-Type': 'application/json; charset=UTF-8',
                        'X-Upload-Content-Type': 'video/*',
                    },
                },
            );

            // The session URI is in the Location header
            const sessionUri = response.headers['location'];
            if (!sessionUri) {
                throw new Error('No upload session URI returned from YouTube');
            }

            this.logger.log(`[YouTube] Resumable session created`);
            return sessionUri;
        } catch (err: any) {
            this.logger.error(
                `[YouTube] Failed to initiate upload: ${JSON.stringify(err.response?.data, null, 2) || err.message}`,
            );
            throw err;
        }
    }

    /**
     * Upload video binary to the resumable session URI
     */
    private async uploadVideoToSession(
        sessionUri: string,
        videoUrl: string,
        access_token: string,
    ): Promise<string> {
        try {
            // Download video from our storage
            this.logger.log(`[YouTube] Downloading video from: ${videoUrl}`);
            const videoResponse = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
            });
            const videoBuffer = Buffer.from(videoResponse.data);
            const contentLength = videoBuffer.length;

            this.logger.log(`[YouTube] Uploading ${(contentLength / 1024 / 1024).toFixed(2)}MB to YouTube...`);

            // Upload to session URI
            const uploadResponse = await axios.put(sessionUri, videoBuffer, {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    'Content-Type': 'video/*',
                    'Content-Length': contentLength,
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });

            const videoId = uploadResponse.data?.id;
            if (!videoId) {
                throw new Error('No video ID returned from YouTube upload');
            }

            this.logger.log(`[YouTube] Upload complete, video ID: ${videoId}`);
            return videoId;
        } catch (err: any) {
            this.logger.error(
                `[YouTube] Upload failed: ${JSON.stringify(err.response?.data, null, 2) || err.message}`,
            );
            throw err;
        }
    }

    /**
     * Check video processing status
     * YouTube processes videos after upload - we poll until ready
     */
    async checkPublishStatus(
        videoId: string,
        access_token: string,
    ): Promise<AsyncPublishStatus> {
        try {
            const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
                params: {
                    part: 'status,processingDetails',
                    id: videoId,
                },
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            });

            const video = response.data.items?.[0];
            if (!video) {
                return {
                    status: 'NOT_FOUND',
                    failReason: 'Video not found',
                };
            }

            const uploadStatus = video.status?.uploadStatus;
            const processingStatus = video.processingDetails?.processingStatus;

            this.logger.log(
                `[YouTube] Status check for ${videoId}: upload=${uploadStatus}, processing=${processingStatus}`,
            );

            // Map YouTube statuses to our generic statuses
            if (uploadStatus === 'processed' || processingStatus === 'succeeded') {
                // Return null for postUrl - completePublish will set the correct URL based on isShort metadata
                return {
                    status: 'PUBLISH_COMPLETE',
                    postId: videoId,
                    postUrl: undefined, // Let completePublish handle this with proper isShort metadata
                };
            }

            if (uploadStatus === 'failed' || video.status?.failureReason) {
                return {
                    status: 'FAILED',
                    failReason: video.status?.failureReason || 'Upload failed',
                };
            }

            if (uploadStatus === 'rejected') {
                return {
                    status: 'FAILED',
                    failReason: video.status?.rejectionReason || 'Video rejected by YouTube',
                };
            }

            // Still processing
            return {
                status: 'PROCESSING_UPLOAD',
                postId: videoId,
            };
        } catch (error: any) {
            this.logger.error(
                `[YouTube] Status check error: ${error.response?.data || error.message}`,
            );
            throw error;
        }
    }

    /**
     * Complete the publish - YouTube doesn't need a separate publish step
     * Just construct the final URL
     */
    async completePublish(
        videoId: string,
        access_token: string,
        metadata: Record<string, any>,
    ): Promise<{ postId?: string; postUrl?: string }> {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Check if it's a Short based on metadata
        if (metadata.isShort) {
            const shortsUrl = `https://www.youtube.com/shorts/${videoId}`;
            this.logger.log(`[YouTube] Short URL: ${shortsUrl}`);
            return {
                postId: videoId,
                postUrl: shortsUrl,
            };
        }

        this.logger.log(`[YouTube] Video URL: ${videoUrl}`);
        return {
            postId: videoId,
            postUrl: videoUrl,
        };
    }

    /**
     * Get polling job data for async video processing
     */
    getPollingJobData(
        publishedPost: any,
        result: any,
        access_token: string,
        metadata: Record<string, any>,
    ): AsyncPollingJobData | null {
        if (!result.publish_id) {
            return null;
        }

        return {
            publishedPostId: publishedPost.id,
            publish_id: result.publish_id,
            access_token: access_token,
            platform: PlatformType.YOUTUBE,
            metadata: {
                username: metadata.username || 'user',
                isShort: metadata.youtubeSettings?.is_short || false,
            },
        };
    }

    /**
     * Get analytics for a published YouTube video
     * @param platformPostId The YouTube video ID
     * @param access_token OAuth access token with youtube.readonly scope
     */
    async getPostAnalytics(platformPostId: string, access_token: string): Promise<PlatformAnalyticsResponse> {
        try {
            this.logger.log(`[YouTube] Fetching analytics for video: ${platformPostId}`);

            const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
                params: {
                    part: 'statistics',
                    id: platformPostId,
                },
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            });

            const video = response.data.items?.[0];

            if (!video) {
                throw new Error(`YouTube video ${platformPostId} not found`);
            }

            const stats = video.statistics;

            return {
                views: parseInt(stats.viewCount) || 0,
                likes: parseInt(stats.likeCount) || 0,
                comments: parseInt(stats.commentCount) || 0,
                shares: 0, // YouTube doesn't provide share count via API
                saves: parseInt(stats.favoriteCount) || 0,
                rawMetrics: stats,
            };
        } catch (error: any) {
            this.logger.error(`[YouTube] Analytics fetch error: ${error.message}`);
            throw error;
        }
    }
}

