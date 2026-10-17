import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod/v4';
import { JobService } from '../../queue/job.service';
import { McpToolDef, McpToolError, McpToolGroup } from '../mcp-tool';
import { McpAuthContext } from '../mcp-auth.context';

@Injectable()
export class JobToolsGroup implements McpToolGroup {
  constructor(private readonly jobService: JobService) {}

  tools(): McpToolDef[] {
    return [
      {
        name: 'get_job',
        title: 'Get job status',
        description:
          'Get the status of a background job. Use it for jobs from import_media_from_url, generate_post_text and generate_insights. Call it again until status is completed or failed.',
        scopes: [],
        inputSchema: z.object({ jobId: z.string().min(1).max(200) }),
        handler: (args: { jobId: string }, ctx: McpAuthContext) => this.getJob(args.jobId, ctx),
      },
    ];
  }

  private async getJob(jobId: string, ctx: McpAuthContext) {
    try {
      const job = await this.jobService.getJobStatus(jobId, {
        tenantId: ctx.tenantId,
        requireTenant: true,
      });
      return {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        result: job.result,
        error: job.error,
      };
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new McpToolError('Job not found.');
      }
      throw err;
    }
  }
}
