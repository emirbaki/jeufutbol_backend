import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, MONITORING_JOBS } from '../queue/queue.config';
import { MonitoringService } from './monitoring.service';
import { AIInsightsService } from '../insights/ai-insights.service';
import {
    FetchProfileTweetsJobData,
    RefreshAllProfilesJobData,
    FetchProfileTweetsJobResult,
    RefreshAllProfilesJobResult,
} from '../insights/dto/job.dto';

@Processor(QUEUE_NAMES.TWEET_MONITORING, {
    concurrency: 1, // Process jobs one by one to avoid rate limits
})
export class MonitoringProcessor extends WorkerHost {
    private readonly logger = new Logger(MonitoringProcessor.name);

    constructor(
        private readonly monitoringService: MonitoringService,
        private readonly aiInsightsService: AIInsightsService,
    ) {
        super();
    }

    async process(
        job: Job<FetchProfileTweetsJobData | RefreshAllProfilesJobData, any, string>,
    ): Promise<any> {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);

        try {
            switch (job.name) {
                case MONITORING_JOBS.FETCH_PROFILE_TWEETS:
                    return await this.handleFetchProfileTweets(
                        job as Job<FetchProfileTweetsJobData, FetchProfileTweetsJobResult>,
                    );

                case MONITORING_JOBS.REFRESH_ALL_PROFILES:
                    return await this.handleRefreshAllProfiles(
                        job as Job<RefreshAllProfilesJobData, RefreshAllProfilesJobResult>,
                    );

                default:
                    throw new Error(`Unknown job type: ${job.name}`);
            }
        } catch (error) {
            this.logger.error(
                `Job ${job.id} failed: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    private async handleFetchProfileTweets(
        job: Job<FetchProfileTweetsJobData, FetchProfileTweetsJobResult>,
    ): Promise<FetchProfileTweetsJobResult> {
        const { profileId, count } = job.data;

        // Update progress
        await job.updateProgress(10);

        // Fetch tweets
        const tweetsCount = await this.monitoringService.fetchAndStoreTweetsInternal(
            profileId,
            count,
        );

        // Auto-index tweets to vector database if we fetched any
        if (tweetsCount > 0) {
            try {
                await job.updateProgress(50);
                const indexedCount = await this.aiInsightsService.indexTweetsToVectorDb(profileId);
                this.logger.log(`Auto-indexed ${indexedCount} tweets to vector DB for profile ${profileId}`);
            } catch (error) {
                this.logger.warn(`Failed to auto-index tweets: ${error.message}`);
                // Don't fail the job if indexing fails
            }
        }

        // Update progress
        await job.updateProgress(100);

        return {
            tweetsCount,
            profileId,
        };
    }

    private async handleRefreshAllProfiles(
        job: Job<RefreshAllProfilesJobData, RefreshAllProfilesJobResult>,
    ): Promise<RefreshAllProfilesJobResult> {
        // Update progress
        await job.updateProgress(10);

        // Trigger refresh of all profiles (enqueues individual jobs)
        const enqueuedCount = await this.monitoringService.refreshAllProfilesInternal();

        // Update progress
        await job.updateProgress(100);

        return {
            enqueuedCount,
        };
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.log(`Job ${job.id} completed successfully`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, error: Error) {
        this.logger.error(
            `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
        );
    }
}
