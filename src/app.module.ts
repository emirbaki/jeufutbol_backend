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
import { JwtService } from '@nestjs/jwt';
import { StaticFilesModule } from './staticfiles/staticfiles.module';
import { UploadModule } from './upload/upload.module';
import { CredentialsModule } from './credentials/credential.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
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
import { PubSubModule } from './pubsub/pubsub.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { McpModule } from './mcp/mcp.module';


import { WorkspaceAccessService } from './workspaces/workspace-access.service';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [AuthModule, WorkspacesModule],
      inject: [JwtService, WorkspaceAccessService, DataSource],
      useFactory: (jwtService: JwtService, accessService: WorkspaceAccessService, dataSource: DataSource) => ({
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        playground: false,
        allowBatchedHttpRequests: false,
        introspection: process.env.NODE_ENV !== 'production',
        subscriptions: {
          'graphql-ws': {
            onConnect: async (context: any) => {
              const { connectionParams, extra } = context;
              const token = connectionParams?.Authorization?.replace('Bearer ', '') ||
                connectionParams?.authorization?.replace('Bearer ', '');
              if (token) {
                try {
                  const user = jwtService.verify(token);
                  extra.user = user;
                  extra.token = token;
                  // The tenant and branch access of the connection, for the subscription filters.
                  // The access stays fixed for the life of the connection.
                  const dbUser = await dataSource.getRepository(User).findOne({ where: { id: user.sub } });
                  if (dbUser) {
                    extra.tenantId = dbUser.tenantId;
                    extra.workspaceAccess = await accessService.accessFor(dbUser, null);
                  }
                } catch (err) {
                  console.error('WebSocket auth failed:', err.message);
                }
              }
            },
          },
        },
        context: ({ req, extra }) => {
          if (extra) {
            return {
              req: {
                ...req,
                user: extra.user,
                tenantId: extra.tenantId,
                workspaceAccess: extra.workspaceAccess,
                headers: {
                  ...req?.headers,
                  authorization: extra.token ? `Bearer ${extra.token}` : undefined,
                },
              },
            };
          }
          return { req };
        },
        validationRules: [
          ...createSecurityValidationRules({
            maxAliases: 15,
            maxDirectives: 10,
          }),
        ],
        plugins:
          process.env.NODE_ENV === 'development'
            ? [ApolloServerPluginLandingPageLocalDefault()]
            : [],
      }),
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
    WorkspacesModule,
    TweetsModule,
    MonitoringModule,
    AIInsightsModule,
    EmailModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
      },
    ]),
    QueueModule,
    RedisCacheModule,
    QueueDashboardModule,
    TenancyModule,
    UserModule,
    PubSubModule,
    SubscriptionModule,
    McpModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    GraphqlResolver,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule { }
