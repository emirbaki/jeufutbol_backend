import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ApiKey } from '../../entities/api-key.entity';

export const CurrentApiKey = createParamDecorator(
  (data: unknown, context: ExecutionContext): ApiKey | undefined => {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest()?.apiKey;
    }

    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req?.apiKey;
  },
);
