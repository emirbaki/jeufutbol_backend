import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JobService } from './job.service';
import { JobStatusObject, JobResultObject } from './job.types';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';

@Resolver()
@UseGuards(GqlAuthGuard)
export class JobResolver {
    constructor(private readonly jobService: JobService) { }

    @Query(() => JobStatusObject, { description: 'Get status of a job by ID' })
    async jobStatus(@Args('jobId') jobId: string): Promise<JobStatusObject> {
        return this.jobService.getJobStatus(jobId);
    }

    @Query(() => [JobStatusObject], {
        description: 'Get status of multiple jobs',
    })
    async jobStatuses(
        @Args('jobIds', { type: () => [String] }) jobIds: string[],
    ): Promise<JobStatusObject[]> {
        return this.jobService.getJobStatuses(jobIds);
    }

    @Query(() => JobResultObject, {
        description: 'Get result of a completed job',
    })
    async jobResult(@Args('jobId') jobId: string): Promise<JobResultObject> {
        const result = await this.jobService.getJobResult(jobId);
        return {
            jobId,
            result,
        };
    }

    @Mutation(() => JobStatusObject, { description: 'Retry a failed job' })
    async retryJob(@Args('jobId') jobId: string): Promise<JobStatusObject> {
        return this.jobService.retryJob(jobId);
    }

    @Query(() => [JobStatusObject], {
        description: 'Get all jobs from a specific queue',
    })
    async queueJobs(
        @Args('queueName') queueName: string,
    ): Promise<JobStatusObject[]> {
        return this.jobService.getQueueJobs(queueName);
    }
}
