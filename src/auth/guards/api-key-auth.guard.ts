import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../entities/api-key.entity';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
    constructor(
        @InjectRepository(ApiKey)
        private apiKeyRepository: Repository<ApiKey>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const ctx = GqlExecutionContext.create(context);
        const request = ctx.getContext().req;

        const apiKeyHeader = request.headers['x-api-key'];

        if (!apiKeyHeader) {
            throw new UnauthorizedException('API key is required');
        }

        // Hash the provided API key
        const hashedKey = this.hashApiKey(apiKeyHeader);

        // Find the API key in the database
        const apiKey = await this.apiKeyRepository.findOne({
            where: { key: hashedKey, isActive: true },
            relations: ['tenant'],
        });

        if (!apiKey) {
            throw new UnauthorizedException('Invalid API key');
        }

        // Check if the API key has expired
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
            throw new UnauthorizedException('API key has expired');
        }

        // Attach API key to request context
        request.apiKey = apiKey;

        // Update last used timestamp (async, don't wait)
        this.updateLastUsed(apiKey.id).catch(() => {
            // Silently fail - this is just for tracking
        });

        return true;
    }

    private hashApiKey(apiKey: string): string {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }

    private async updateLastUsed(apiKeyId: string): Promise<void> {
        await this.apiKeyRepository.update(apiKeyId, {
            lastUsedAt: new Date(),
        });
    }
}
