import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Resolver(() => User)
@UseGuards(GqlAuthGuard)
export class UserResolver {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  @Query(() => [User])
  async getOrganizationUsers(@CurrentUser() user: User): Promise<User[]> {
    // Get all users in the same tenant/organization
    return this.userRepository.find({
      where: { tenantId: user.tenantId, isActive: true },
      order: { createdAt: 'ASC' },
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'createdAt',
        'isVerified',
      ],
    });
  }
}
