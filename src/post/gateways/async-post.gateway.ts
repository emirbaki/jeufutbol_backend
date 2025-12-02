import { PlatformType } from 'src/enums/platform-type.enum';
import { PostGateway } from './post-base.gateway';

/**
 * Job data interface for async post polling
 * Used by the generic async polling processor
 */
export interface AsyncPollingJobData {
    publishedPostId: string; // ID of the PublishedPost entity
    publish_id: string; // Container/upload ID from the platform
    access_token: string; // OAuth token for status checks
    platform: PlatformType; // Platform type for gateway selection
    metadata?: Record<string, any>; // Platform-specific metadata (username, media type, etc.)
}

/**
 * Status response interface for async post polling
 */
export interface AsyncPublishStatus {
    status: string; // Current status (PROCESSING, COMPLETE, FAILED, etc.)
    postId?: string; // Final platform post ID (if available)
    postUrl?: string; // Final platform post URL (if available)
    failReason?: string; // Failure reason (if failed)
}

/**
 * Abstract base class for gateways that require asynchronous polling
 * Extends the base PostGateway with async-specific methods
 *
 * Use this for platforms like TikTok and Instagram Reels where:
 * - Upload happens in two steps (initiate + poll)
 * - Processing takes significant time
 * - Final URL is not immediately available
 */
export abstract class AsyncPostGateway extends PostGateway {
    /**
     * Check the publish status for async uploads
     * Called periodically by the polling processor
     *
     * @param publishId - The container/upload ID from the platform
     * @param access_token - OAuth access token
     * @returns Status information for the polling processor
     */
    abstract checkPublishStatus(
        publishId: string,
        access_token: string,
    ): Promise<AsyncPublishStatus>;

    /**
     * Get polling job data for async uploads
     * Return null if this post doesn't need async polling
     *
     * @param publishedPost - The PublishedPost entity (before save)
     * @param result - Result from createNewPost()
     * @param access_token - OAuth access token
     * @param metadata - Additional metadata (username, media type, etc.)
     * @returns Job data for async polling, or null if not needed
     */
    abstract getPollingJobData(
        publishedPost: any,
        result: any,
        access_token: string,
        metadata: Record<string, any>,
    ): AsyncPollingJobData | null;

    /**
     * Complete the publish process after async upload finishes
     * Called when status is FINISHED/PUBLISH_COMPLETE
     *
     * For platforms like Instagram that need a final "publish" API call
     * after the container is ready. Default implementation does nothing.
     *
     * @param publishId - The container/upload ID
     * @param access_token - OAuth access token
     * @param metadata - Platform-specific metadata from job
     * @returns Final post ID and URL if applicable
     */
    async completePublish(
        publishId: string,
        access_token: string,
        metadata: Record<string, any>,
    ): Promise<{ postId?: string; postUrl?: string }> {
        // Default: no additional publishing step needed
        return {};
    }
}
