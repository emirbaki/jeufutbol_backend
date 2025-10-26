import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Credential } from '../entities/credential.entity';
import { CredentialsService } from './credential.service';
import { CredentialsController } from './credential.controller';
import { OAuthService } from './oauth.service';

@Module({
  imports: [TypeOrmModule.forFeature([Credential]), HttpModule, ConfigModule],
  controllers: [CredentialsController],
  providers: [CredentialsService, OAuthService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
