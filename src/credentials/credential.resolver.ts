import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CredentialsService } from './credential.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
// import { CredentialType } from 'src/graphql/types/credential.type';
import { Credential } from '../entities/credential.entity';
@Resolver()
@UseGuards(GqlAuthGuard)
export class CredentialsResolver {
  constructor(private credentialsService: CredentialsService) { }

  @Query(() => [Credential])
  async getCredentials(
    @CurrentUser() user: User,
    @Args('platform', { nullable: true }) platform?: string,
  ) {
    return this.credentialsService.getUserCredentials(user.id, platform as any);
  }

  @Query(() => [Credential])
  async getConnectedAccounts(@CurrentUser() user: User) {
    return this.credentialsService.getUserCredentials(user.id);
  }

  @Mutation(() => Boolean)
  async deleteCredential(
    @CurrentUser() user: User,
    @Args('credentialId') credentialId: string,
  ) {
    await this.credentialsService.deleteCredential(credentialId, user.id);
    return true;
  }

  @Mutation(() => Boolean)
  async testCredential(
    @CurrentUser() user: User,
    @Args('credentialId') credentialId: string,
  ) {
    return this.credentialsService.testConnection(credentialId, user.id);
  }
}
