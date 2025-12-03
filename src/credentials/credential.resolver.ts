import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CredentialsService } from './credential.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Credential } from '../entities/credential.entity';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { ApiKeyScope } from '../auth/api-key-scopes.enum';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKey } from '../entities/api-key.entity';

@Resolver()
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class CredentialsResolver {
  constructor(private credentialsService: CredentialsService) { }

  @Query(() => [Credential])
  @RequireScopes(ApiKeyScope.CREDENTIALS_READ)
  async getCredentials(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('platform', { nullable: true }) platform?: string,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.credentialsService.getUserCredentials(
      userId,
      tenantId,
      platform as any,
    );
  }

  @Query(() => [Credential])
  @RequireScopes(ApiKeyScope.CREDENTIALS_READ)
  async getConnectedAccounts(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.credentialsService.getUserCredentials(userId, tenantId);
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.CREDENTIALS_WRITE)
  async deleteCredential(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('credentialId') credentialId: string,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    await this.credentialsService.deleteCredential(
      credentialId,
      userId,
      tenantId,
    );
    return true;
  }

  @Mutation(() => Boolean)
  @RequireScopes(ApiKeyScope.CREDENTIALS_READ) // Testing connection is read-like, or maybe write? Let's say READ as it doesn't modify data usually
  async testCredential(
    @CurrentUser() user: User,
    @CurrentApiKey() apiKey: ApiKey,
    @Args('credentialId') credentialId: string,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    return this.credentialsService.testConnection(
      credentialId,
      userId,
      tenantId,
    );
  }
}
