import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { GraphqlResolver } from './graphql/graphql.resolver';
import { DatabaseModule } from './database/database.module';
import { PostModule } from './post/post.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UploadService } from './upload/upload.service';
import { UploadController } from './upload/upload.controller';
import { StaticFilesModule } from './staticfiles/staticfiles.module';
import { UploadModule } from './upload/upload.module';
import { CredentialsModule } from './credentials/credential.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { TweetsModule } from './tweets/tweets.module';
import { AIInsightsModule } from './insights/ai-insights.module';
import { EmailModule } from './email/email.module';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { createSecurityValidationRules } from './graphql/security.validation';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from './throttle-behind-proxy/throttle-behind-proxy.guard';
import { QueueModule } from './queue/queue.module';
import { RedisCacheModule } from './cache/redis-cache.module';
import { QueueDashboardModule } from './queue/queue-dashboard.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      playground: false,
      allowBatchedHttpRequests: false,
      introspection: process.env.NODE_ENV !== 'production',
      validationRules: [
        ...createSecurityValidationRules({
          maxAliases: 15,
          maxDirectives: 10,
        }),
      ],
      // formatError: (error: any) => {
      //   if (process.env.NODE_ENV === 'production') {
      //     const code = error.extensions?.code || 'INTERNAL_SERVER_ERROR';
      //     // Only mask the message if it's an internal server error
      //     if (code === 'INTERNAL_SERVER_ERROR') {
      //       return {
      //         message: 'Internal Server Error / GTFO',
      //         code: code,
      //         locations: error.locations,
      //         path: error.path,
      //       };
      //     }
      //     // For other errors (e.g. validation), return the message
      //     return {
      //       message: error.message,
      //       code: code,
      //       locations: error.locations,
      //       path: error.path,
      //     };
      //   }
      //   return error;
      // },
      // cors: {
      //   origin: ['http://localhost:4200', 'https://jeufutbol.com.tr'],
      //   credentials: true,
      // },
      plugins:
        process.env.NODE_ENV === 'development'
          ? [ApolloServerPluginLandingPageLocalDefault()]
          : [],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [join(__dirname, '**', '*.entity.{ts,js}')],
        synchronize: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    PostModule,
    AuthModule,
    StaticFilesModule,
    UploadModule,
    CredentialsModule,
    TweetsModule,
    MonitoringModule,
    AIInsightsModule,
    EmailModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 20,
      },
    ]),
    QueueModule,
    RedisCacheModule,
    QueueDashboardModule,
    TenancyModule,
    UserModule,
  ],
  controllers: [AppController, UploadController],
  providers: [
    AppService,
    GraphqlResolver,
    UploadService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule { }
