import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { PostsService } from './post.service';
import { PostsResolver } from './post.resolver';
import { Post } from '../entities/post.entity';
import { PublishedPost } from '../entities/published-post.entity';
import { SocialAccount } from '../entities/social-account.entity';
import { PostGatewayFactory } from './post-gateway.factory';
import { FacebookPostGateway } from './gateways/facebook.gateway';
import { InstagramPostGateway } from './gateways/instagram.gateway';
import { TiktokPostGateway } from './gateways/tiktok.gateway';
import { XPostGateway } from './gateways/x.gateway';
import { Credential } from 'src/entities/credential.entity';
import { CredentialsService } from 'src/credentials/credential.service';
import { CredentialsModule } from 'src/credentials/credential.module';
import { UploadModule } from 'src/upload/upload.module';
import { UploadService } from 'src/upload/upload.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PublishedPost, SocialAccount, Credential]),
    HttpModule,
    CredentialsModule,
    UploadModule,
  ],
  providers: [
    UploadService,
    CredentialsService,
    PostsService,
    PostsResolver,
    PostGatewayFactory,
    FacebookPostGateway,
    InstagramPostGateway,
    TiktokPostGateway,
    XPostGateway,
  ],
  exports: [PostsService],
})
export class PostModule {}
