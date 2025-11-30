import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { PostsService } from './post.service';
import { PostsResolver } from './post.resolver';
import { Post } from '../entities/post.entity';
import { PublishedPost } from '../entities/published-post.entity';
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
import { TweetsModule } from 'src/tweets/tweets.module';
import { TokenRefreshService } from 'src/credentials/token-refresher.service';
import { EncryptionService } from 'src/credentials/token-encryption.service';
import { TiktokPollingProcessor } from './processors/tiktok-polling.processor';
import { AsyncPollingProcessor } from './processors/async-polling.processor';
import { QUEUE_NAMES } from 'src/queue/queue.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PublishedPost, Credential]),
    HttpModule,
    CredentialsModule,
    UploadModule,
    TweetsModule,
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.TIKTOK_POLLING, // Deprecated - keeping for backward compatibility
      },
      {
        name: QUEUE_NAMES.ASYNC_POST_POLLING, // New generic async polling queue
      },
    ),
  ],
  providers: [
    UploadService,
    CredentialsService,
    TokenRefreshService,
    EncryptionService,
    PostsService,
    PostsResolver,
    PostGatewayFactory,
    FacebookPostGateway,
    InstagramPostGateway,
    TiktokPostGateway,
    XPostGateway,
    TiktokPollingProcessor, // Deprecated - keeping for backward compatibility
    AsyncPollingProcessor, // New generic async processor
  ],
  exports: [PostsService],
})
export class PostModule { }
