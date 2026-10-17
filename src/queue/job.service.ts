import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue/queue.config';
import { JobStatusDto, JobStatusEnum } from '../insights/dto/job.dto';

/**
 * Who is asking for a job.
 * - `tenantId`: a job whose data has a different `tenantId` is not found.
 * - `requireTenant`: a job whose data has no `tenantId` is not found.
 */
export interface JobAccess {
  tenantId?: string;
  requireTenant?: boolean;
}

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_INSIGHTS)
    private aiInsightsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TWEET_MONITORING)
    private monitoringQueue: Queue,
    @InjectQueue(QUEUE_NAMES.MEDIA_IMPORT)
    private mediaImportQueue: Queue,
  ) {}

  /**
   * Get job status by ID (checks all queues)
   */
  async getJobStatus(jobId: string, access?: JobAccess): Promise<JobStatusDto> {
    const job = await this.findJob(jobId, access);
    return this.mapJobToDto(job);
  }

  /**
   * Get multiple job statuses
   */
  async getJobStatuses(
    jobIds: string[],
    access?: JobAccess,
  ): Promise<JobStatusDto[]> {
    const statuses = await Promise.all(
      jobIds.map(async (id) => {
        try {
          return await this.getJobStatus(id, access);
        } catch (error) {
          this.logger.warn(`Job ${id} not found`);
          return null;
        }
      }),
    );

    return statuses.filter((s) => s !== null);
  }

  /**
   * Get all jobs for a specific queue
   */
  async getQueueJobs(
    queueName: string,
    statuses: JobStatusEnum[] = [
      JobStatusEnum.WAITING,
      JobStatusEnum.ACTIVE,
      JobStatusEnum.COMPLETED,
      JobStatusEnum.FAILED,
    ],
  ): Promise<JobStatusDto[]> {
    const queue = this.getQueue(queueName);
    const jobs: Job[] = [];

    for (const status of statuses) {
      const statusJobs = await queue.getJobs(status);
      jobs.push(...statusJobs);
    }

    return Promise.all(jobs.map((job) => this.mapJobToDto(job)));
  }

  /**
   * Get result of a completed job
   */
  async getJobResult(jobId: string, access?: JobAccess): Promise<any> {
    const status = await this.getJobStatus(jobId, access);

    if (status.status !== JobStatusEnum.COMPLETED) {
      throw new Error(
        `Job ${jobId} is not completed yet (status: ${status.status})`,
      );
    }

    return status.result;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string, access?: JobAccess): Promise<JobStatusDto> {
    const job = await this.findJob(jobId, access);

    if (await job.isFailed()) {
      await job.retry();
      this.logger.log(`Retrying job ${jobId}`);
    } else {
      throw new Error(`Job ${jobId} is not in failed state`);
    }

    return this.mapJobToDto(job);
  }

  /**
   * Find a job in the AI insights, monitoring and media import queues, and
   * apply the tenant rules of `access`. A job the caller may not see is
   * reported as not found, so job IDs of other tenants do not leak.
   */
  private async findJob(jobId: string, access?: JobAccess): Promise<Job> {
    const job =
      (await this.aiInsightsQueue.getJob(jobId)) ||
      (await this.monitoringQueue.getJob(jobId)) ||
      (await this.mediaImportQueue.getJob(jobId));

    if (!job || !this.canAccess(job, access)) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return job;
  }

  private canAccess(job: Job, access?: JobAccess): boolean {
    const jobTenantId: string | undefined = job.data?.tenantId;

    if (jobTenantId) {
      return jobTenantId === access?.tenantId;
    }

    return !access?.requireTenant;
  }

  /**
   * Map BullMQ Job to JobStatusDto
   */
  private async mapJobToDto(job: Job): Promise<JobStatusDto> {
    const state = await job.getState();

    return {
      id: job.id || '',
      status: this.mapState(state),
      progress: (job.progress as number) || 0,
      result: job.returnvalue,
      error: job.failedReason,
      createdAt: new Date(job.timestamp),
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }

  /**
   * Map BullMQ state to JobStatusEnum
   */
  private mapState(state: string): JobStatusEnum {
    switch (state) {
      case 'waiting':
        return JobStatusEnum.WAITING;
      case 'active':
        return JobStatusEnum.ACTIVE;
      case 'completed':
        return JobStatusEnum.COMPLETED;
      case 'failed':
        return JobStatusEnum.FAILED;
      case 'delayed':
        return JobStatusEnum.DELAYED;
      default:
        return JobStatusEnum.WAITING;
    }
  }

  /**
   * Get queue by name
   */
  private getQueue(queueName: string): Queue {
    switch (queueName) {
      case QUEUE_NAMES.AI_INSIGHTS:
        return this.aiInsightsQueue;
      case QUEUE_NAMES.TWEET_MONITORING:
        return this.monitoringQueue;
      case QUEUE_NAMES.MEDIA_IMPORT:
        return this.mediaImportQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }
}
