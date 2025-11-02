import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { User } from '../../entities/user.entity';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): User => {
    // Try GraphQL context extraction first
    try {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext();
      if (ctx?.req?.user) {
        return ctx.req.user;
      }
    } catch {
      // Not GraphQL context or failed, fallback below
    }

    // Fallback to REST HTTP context
    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);
