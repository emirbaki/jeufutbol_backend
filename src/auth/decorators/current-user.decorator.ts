import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { User } from '../../entities/user.entity';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): User | undefined => {
    // 1. Check for GraphQL context
    if ((context.getType() as string) === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      return ctx.getContext().req?.user;
    }

    // 2. Check for HTTP context
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest();
      return request?.user;
    }

    return undefined;
  },
);
