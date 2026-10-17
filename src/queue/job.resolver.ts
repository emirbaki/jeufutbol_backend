import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JobService } from './job.service';
import { JobStatusObject, JobResultObject } from './job.types';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Resolver()
@UseGuards(GqlAuthGuard)
export class JobResolver {
  constructor(private readonly jobService: JobService) {}

  @Query(() => JobStatusObject, { description: 'Get status of a job by ID' })
  async jobStatus(
    @Args('jobId') jobId: string,
    @CurrentUser() user: User,
  ): Promise<JobStatusObject> {
    return this.jobService.getJobStatus(jobId, { tenantId: user?.tenantId });
  }

  @Query(() => [JobStatusObject], {
    description: 'Get status of multiple jobs',
  })
  async jobStatuses(
    @Args('jobIds', { type: () => [String] }) jobIds: string[],
    @CurrentUser() user: User,
  ): Promise<JobStatusObject[]> {
    return this.jobService.getJobStatuses(jobIds, {
      tenantId: user?.tenantId,
    });
  }

  @Query(() => JobResultObject, {
    description: 'Get result of a completed job',
  })
  async jobResult(
    @Args('jobId') jobId: string,
    @CurrentUser() user: User,
  ): Promise<JobResultObject> {
    const result = await this.jobService.getJobResult(jobId, {
      tenantId: user?.tenantId,
    });
    return {
      jobId,
      result,
    };
  }

  @Mutation(() => JobStatusObject, { description: 'Retry a failed job' })
  async retryJob(
    @Args('jobId') jobId: string,
    @CurrentUser() user: User,
  ): Promise<JobStatusObject> {
    return this.jobService.retryJob(jobId, { tenantId: user?.tenantId });
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
