import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ApiKey } from '../../entities/api-key.entity';

export const CurrentApiKey = createParamDecorator(
    (data: unknown, context: ExecutionContext): ApiKey | undefined => {
        const ctx = GqlExecutionContext.create(context);
        const request = ctx.getContext().req;
        return request.apiKey;
    },
);
