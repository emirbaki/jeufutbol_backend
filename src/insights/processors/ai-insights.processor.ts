import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, AI_INSIGHTS_JOBS } from '../../queue/queue.config';
import { AIInsightsService } from '../ai-insights.service';
import {
    GenerateInsightsJobData,
    GeneratePostJobData,
    IndexTweetsJobData,
    GenerateInsightsJobResult,
    GeneratePostJobResult,
    IndexTweetsJobResult,
} from '../dto/job.dto';

@Processor(QUEUE_NAMES.AI_INSIGHTS)
export class AIInsightsProcessor extends WorkerHost {
    private readonly logger = new Logger(AIInsightsProcessor.name);

    constructor(private readonly aiInsightsService: AIInsightsService) {
        super();
    }

    async process(
        job: Job<
            GenerateInsightsJobData | GeneratePostJobData | IndexTweetsJobData,
            any,
            string
        >,
    ): Promise<any> {
        this.logger.log(
            `Processing job ${job.id} of type ${job.name} for user ${(job.data as any).userId || 'system'}`,
        );

        try {
            switch (job.name) {
                case AI_INSIGHTS_JOBS.GENERATE_INSIGHTS:
                    return await this.handleGenerateInsights(
                        job as Job<GenerateInsightsJobData, GenerateInsightsJobResult>,
                    );

                case AI_INSIGHTS_JOBS.GENERATE_POST:
                    return await this.handleGeneratePost(
                        job as Job<GeneratePostJobData, GeneratePostJobResult>,
                    );

                case AI_INSIGHTS_JOBS.INDEX_TWEETS:
                    return await this.handleIndexTweets(
                        job as Job<IndexTweetsJobData, IndexTweetsJobResult>,
                    );

                default:
                    throw new Error(`Unknown job type: ${job.name}`);
            }
        } catch (error) {
            this.logger.error(
                `Job ${job.id} failed: ${error.message}`,
                error.stack,
            );
            throw error; // Re-throw to trigger retry logic
        }
    }

    private async handleGenerateInsights(
        job: Job<GenerateInsightsJobData, GenerateInsightsJobResult>,
    ): Promise<GenerateInsightsJobResult> {
        const { userId, topic, llmProvider, useVectorSearch, tenantId } = job.data;

        // Update progress: Starting
        await job.updateProgress(10);

        // Generate insights (this is the heavy LLM operation)
        const insights =
            await this.aiInsightsService.generateInsightsInternal({
                userId,
                topic,
                llmProvider,
                useVectorSearch,
                tenantId,
            });

        // Update progress: Complete
        await job.updateProgress(100);

        return {
            insights: insights.map((insight) => ({
                id: insight.id,
                type: insight.type,
                title: insight.title,
                description: insight.description,
                relevanceScore: insight.relevanceScore,
                createdAt: insight.createdAt,
            })),
        };
    }

    private async handleGeneratePost(
        job: Job<GeneratePostJobData, GeneratePostJobResult>,
    ): Promise<GeneratePostJobResult> {
        const data = job.data;

        // Update progress: Starting
        await job.updateProgress(10);

        // Generate post (this is the heavy LangChain agent operation)
        const result =
            await this.aiInsightsService.generatePostTemplateInternal(data);

        // Update progress: Complete
        await job.updateProgress(100);

        return result;
    }

    private async handleIndexTweets(
        job: Job<IndexTweetsJobData, IndexTweetsJobResult>,
    ): Promise<IndexTweetsJobResult> {
        const { profileId } = job.data;

        // Update progress: Starting
        await job.updateProgress(10);

        // Index tweets to vector DB
        const count = await this.aiInsightsService.indexTweetsToVectorDb(profileId);

        // Update progress: Complete
        await job.updateProgress(100);

        return { indexedCount: count };
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

    @OnWorkerEvent('active')
    onActive(job: Job) {
        this.logger.log(`Job ${job.id} is now active`);
    }
}
