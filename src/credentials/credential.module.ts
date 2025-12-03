import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Credential } from '../entities/credential.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { CredentialsService } from './credential.service';
import { CredentialsController } from './credential.controller';
import { OAuthService } from './oauth.service';
import { EncryptionService } from './token-encryption.service';
import { CredentialsResolver } from './credential.resolver';
import { TokenRefreshService } from './token-refresher.service';
import { AuthModule } from '../auth/auth.module';
import { TenancyModule } from 'src/tenancy/tenancy.module';

import { Tenant } from '../entities/tenant.entity';
import { TenancyService } from 'src/tenancy/tenancy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Credential, User, ApiKey, Tenant]),
    HttpModule,
    ConfigModule,
    AuthModule,
    TenancyModule,
  ],
  controllers: [CredentialsController],
  providers: [
    CredentialsService,
    OAuthService,
    EncryptionService,
    CredentialsResolver,
    TokenRefreshService,
    TenancyService
  ],
  exports: [CredentialsService, EncryptionService],
})
export class CredentialsModule { }
