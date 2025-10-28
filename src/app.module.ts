import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { GraphqlResolver } from './graphql/graphql.resolver';
import { DatabaseModule } from './database/database.module';
import { PostModule } from './post/post.module';
import { SocialAccountsModule } from './social-accounts/social-accounts.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UploadService } from './upload/upload.service';
import { UploadController } from './upload/upload.controller';
import { StaticFilesModule } from './staticfiles/staticfiles.module';
import { UploadModule } from './upload/upload.module';
import { CredentialsModule } from './credentials/credential.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    GraphQLModule.forRoot({
      driver: ApolloDriver,
      playground: true,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      cors: {
        origin: ['http://localhost:4200', 'https://jeufutbol.com.tr'],
        credentials: true,
      },
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
    SocialAccountsModule,
    AuthModule,
    // StaticFilesModule,
    UploadModule,
    CredentialsModule,
  ],
  controllers: [AppController, UploadController],
  providers: [AppService, GraphqlResolver, UploadService],
})
export class AppModule {}
