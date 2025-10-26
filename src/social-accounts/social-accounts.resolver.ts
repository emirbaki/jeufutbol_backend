import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SocialAccountsService } from './social-accounts.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { SocialAccount } from '../entities/social-account.entity';

@Resolver()
@UseGuards(GqlAuthGuard)
export class SocialAccountsResolver {
  constructor(private socialAccountsService: SocialAccountsService) {}

  @Query(() => [SocialAccount])
  async getConnectedAccounts(
    @CurrentUser() user: User,
  ): Promise<SocialAccount[]> {
    return this.socialAccountsService.getConnectedAccounts(user.id);
  }

  @Mutation(() => Boolean)
  async disconnectAccount(
    @CurrentUser() user: User,
    @Args('accountId') accountId: string,
  ): Promise<boolean> {
    return this.socialAccountsService.disconnectAccount(user.id, accountId);
  }
}
