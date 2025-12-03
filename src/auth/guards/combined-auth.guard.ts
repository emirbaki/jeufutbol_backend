import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { ApiKey } from '../../entities/api-key.entity';
import { Tenant } from '../../entities/tenant.entity';
import * as crypto from 'crypto';
import { ApiKeyScope } from '../api-key-scopes.enum';
import { UserRole } from '../user-role.enum';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(ApiKey)
        private apiKeyRepository: Repository<ApiKey>,
        @InjectRepository(Tenant)
        private tenantRepository: Repository<Tenant>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        let request;
        if (context.getType() === 'http') {
            request = context.switchToHttp().getRequest();
        } else {
            const ctx = GqlExecutionContext.create(context);
            request = ctx.getContext().req;
        }

        // Try JWT authentication first
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const payload = this.jwtService.verify(token);

                if (payload.type === 'api_key') {
                    const apiKey = await this.apiKeyRepository.findOne({
                        where: { id: payload.sub, isActive: true },
                        relations: ['tenant'],
                    });
                    if (apiKey) {
                        request.apiKey = apiKey;
                        this.updateLastUsed(apiKey.id).catch(() => { });
                        return true;
                    }
                } else if (payload.type === 'tenant_client') {
                    const tenant = await this.tenantRepository.findOne({ where: { id: payload.sub } });
                    if (tenant) {
                        // Find the first Admin user of the tenant to act as the context
                        const adminUser = await this.userRepository.findOne({
                            where: { tenantId: tenant.id, role: UserRole.ADMIN } as any,
                            order: { createdAt: 'ASC' },
                        });

                        if (adminUser) {
                            request.user = adminUser;
                        }

                        // Compatibility: Map Tenant Client to ApiKey context
                        request.apiKey = {
                            id: 'tenant-client',
                            key: 'tenant-client',
                            keyPrefix: 'tenant',
                            name: 'Tenant Client',
                            scopes: payload.scope || [ApiKeyScope.ADMIN], // Use requested scopes or default to Admin
                            isActive: true,
                            createdAt: new Date(),
                            lastUsedAt: new Date(),
                            tenantId: tenant.id,
                            tenant: tenant,
                            createdByUserId: adminUser?.id || null,
                        } as any;
                        return true;
                    }
                } else {
                    const user = await this.userRepository.findOne({
                        where: { id: payload.sub },
                        relations: ['tenant'],
                    });

                    if (user && user.isActive) {
                        request.user = user;
                        return true;
                    }
                }
            } catch (error) {
                // JWT verification failed, try as API key (Bearer <api_key>)
                const hashedKey = this.hashApiKey(token);
                const apiKey = await this.apiKeyRepository.findOne({
                    where: { key: hashedKey, isActive: true },
                    relations: ['tenant'],
                });

                if (apiKey && (!apiKey.expiresAt || apiKey.expiresAt >= new Date())) {
                    request.apiKey = apiKey;
                    this.updateLastUsed(apiKey.id).catch(() => { });
                    return true;
                }
            }
        }

        // Try API key authentication
        const apiKeyHeader = request.headers['jeu-api-key'];
        if (apiKeyHeader) {
            const hashedKey = this.hashApiKey(apiKeyHeader as string);
            const apiKey = await this.apiKeyRepository.findOne({
                where: { key: hashedKey, isActive: true },
                relations: ['tenant'],
            });

            if (apiKey && (!apiKey.expiresAt || apiKey.expiresAt >= new Date())) {
                request.apiKey = apiKey;

                // Update last used timestamp (async)
                this.updateLastUsed(apiKey.id).catch(() => { });

                return true;
            }
        }

        throw new UnauthorizedException(
            'Authentication required. Provide either a valid JWT token or API key.',
        );
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
