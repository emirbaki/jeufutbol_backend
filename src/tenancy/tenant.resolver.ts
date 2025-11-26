import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { Tenant } from '../entities/tenant.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../auth/user-role.enum';

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
        return this.tenantRepository.findOneByOrFail({ id: user.tenantId });
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
        const tenant = await this.tenantRepository.findOneByOrFail({ id: user.tenantId });
        tenant.name = name;
        return this.tenantRepository.save(tenant);
    }
}
