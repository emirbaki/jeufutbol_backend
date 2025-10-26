import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialAccountsService } from './social-accounts.service';
import { SocialAccountsResolver } from './social-accounts.resolver';
import { SocialAccountsController } from './social-accounts.controller';
import { SocialAccount } from '../entities/social-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SocialAccount])],
  providers: [SocialAccountsService, SocialAccountsResolver],
  controllers: [SocialAccountsController],
  exports: [SocialAccountsService],
})
export class SocialAccountsModule {}
