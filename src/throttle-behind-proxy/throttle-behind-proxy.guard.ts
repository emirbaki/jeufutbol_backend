import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

import { GqlExecutionContext } from '@nestjs/graphql';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return (
      req.headers['cf-connecting-ip'] ??
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
      req.ip ??
      req.connection?.remoteAddress ??
      'unknown'
    );
  }

  protected getRequestResponse(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext();
      return { req: ctx.req, res: ctx.res || { header: () => {} } };
    }
    return super.getRequestResponse(context);
  }
}
