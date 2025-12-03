import {
    Resolver,
    Mutation,
    Query,
    Args,
    ID,
} from '@nestjs/graphql';
import {
    UseGuards,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { UserRole } from './user-role.enum';
import { CreateApiKeyInput } from '../graphql/types/create-api-key.input';
import { CreateApiKeyResponse } from '../graphql/types/create-api-key-response.type';
import * as crypto from 'crypto';

@Resolver(() => ApiKey)
@UseGuards(GqlAuthGuard)
export class ApiKeyResolver {
    constructor(
        @InjectRepository(ApiKey)
        private apiKeyRepository: Repository<ApiKey>,
    ) { }

    @Mutation(() => CreateApiKeyResponse)
    async createApiKey(
        @CurrentUser() user: User,
        @Args('input') input: CreateApiKeyInput,
    ): Promise<CreateApiKeyResponse> {
        // Only ADMIN can create API keys
        if (user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only admins can create API keys');
        }

        // Generate API key
        const plainTextKey = this.generateApiKey();
        const hashedKey = this.hashApiKey(plainTextKey);
        const keyPrefix = plainTextKey.substring(0, 12); // e.g., "jeu_live_xxx"

        // Create API key record
        const apiKey = this.apiKeyRepository.create({
            name: input.name,
            key: hashedKey,
            keyPrefix,
            tenantId: user.tenantId,
            createdByUserId: user.id,
            scopes: input.scopes,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
            isActive: true,
        });

        await this.apiKeyRepository.save(apiKey);

        // Return response with plain text key (only shown once)
        return {
            id: apiKey.id,
            name: apiKey.name,
            apiKey: plainTextKey, // Plain text - only shown once!
            keyPrefix: apiKey.keyPrefix,
            scopes: apiKey.scopes,
            expiresAt: apiKey.expiresAt,
        };
    }

    @Query(() => [ApiKey])
    async listApiKeys(@CurrentUser() user: User): Promise<ApiKey[]> {
        // Only ADMIN can view API keys
        if (user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only admins can view API keys');
        }

        return this.apiKeyRepository.find({
            where: { tenantId: user.tenantId },
            relations: ['createdBy'],
            order: { createdAt: 'DESC' },
        });
    }

    @Mutation(() => Boolean)
    async revokeApiKey(
        @CurrentUser() user: User,
        @Args('apiKeyId', { type: () => ID }) apiKeyId: string,
    ): Promise<boolean> {
        // Only ADMIN can revoke API keys
        if (user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only admins can revoke API keys');
        }

        const apiKey = await this.apiKeyRepository.findOne({
            where: { id: apiKeyId },
        });

        if (!apiKey) {
            throw new NotFoundException('API key not found');
        }

        // Ensure API key belongs to same tenant
        if (apiKey.tenantId !== user.tenantId) {
            throw new ForbiddenException(
                'You can only revoke API keys from your organization',
            );
        }

        apiKey.isActive = false;
        await this.apiKeyRepository.save(apiKey);

        return true;
    }

    @Mutation(() => ApiKey)
    async updateApiKeyScopes(
        @CurrentUser() user: User,
        @Args('apiKeyId', { type: () => ID }) apiKeyId: string,
        @Args('scopes', { type: () => [String] }) scopes: string[],
    ): Promise<ApiKey> {
        // Only ADMIN can update API key scopes
        if (user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only admins can update API key scopes');
        }

        const apiKey = await this.apiKeyRepository.findOne({
            where: { id: apiKeyId },
        });

        if (!apiKey) {
            throw new NotFoundException('API key not found');
        }

        // Ensure API key belongs to same tenant
        if (apiKey.tenantId !== user.tenantId) {
            throw new ForbiddenException(
                'You can only update API keys from your organization',
            );
        }

        apiKey.scopes = scopes;
        return this.apiKeyRepository.save(apiKey);
    }

    // Helper methods
    private generateApiKey(): string {
        const randomBytes = crypto.randomBytes(24);
        const randomString = randomBytes.toString('base64url');
        return `jeu_live_${randomString}`;
    }

    private hashApiKey(apiKey: string): string {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }
}
