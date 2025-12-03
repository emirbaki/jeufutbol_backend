import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Tenant } from '../entities/tenant.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../auth/user-role.enum';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Resolver(() => Tenant)
export class TenantResolver {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) { }

  @Query(() => Tenant)
  @UseGuards(GqlAuthGuard)
  async currentTenant(@CurrentUser() user: User): Promise<Tenant> {
    if (!user.tenantId) {
      throw new Error('User does not belong to any tenant');
    }
    const tenant = await this.tenantRepository.findOneByOrFail({ id: user.tenantId });

    // Backfill clientId if missing
    if (!tenant.clientId) {
      tenant.clientId = `jeu_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      await this.tenantRepository.save(tenant);
    }

    return tenant;
  }

  @Mutation(() => Tenant)
  @UseGuards(GqlAuthGuard)
  async updateTenant(
    @CurrentUser() user: User,
    @Args('name') name: string,
  ): Promise<Tenant> {
    if (!user.tenantId) {
      throw new Error('User does not belong to any tenant');
    }
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Only admins can update organization settings');
    }
    const tenant = await this.tenantRepository.findOneByOrFail({
      id: user.tenantId,
    });
    tenant.name = name;
    return this.tenantRepository.save(tenant);
  }

  @Mutation(() => String)
  @UseGuards(GqlAuthGuard)
  async regenerateClientSecret(@CurrentUser() user: User): Promise<string> {
    if (!user.tenantId) {
      throw new Error('User does not belong to any tenant');
    }
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Only admins can regenerate client secrets');
    }

    const tenant = await this.tenantRepository.findOneByOrFail({
      id: user.tenantId,
    });

    const clientSecret = crypto.randomBytes(32).toString('hex');
    tenant.clientSecretHash = crypto.createHash('sha256').update(clientSecret).digest('hex');

    // Ensure clientId exists (backfill if missing)
    if (!tenant.clientId) {
      tenant.clientId = `jeu_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    }

    await this.tenantRepository.save(tenant);

    return clientSecret;
  }
}
