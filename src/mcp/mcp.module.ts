import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PostModule } from '../post/post.module';
import { CredentialsModule } from '../credentials/credential.module';
import { UploadModule } from '../upload/upload.module';
import { AIInsightsModule } from '../insights/ai-insights.module';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { Tenant } from '../entities/tenant.entity';
import { MCP_CONTROLLERS, MCP_PROVIDERS } from './mcp.providers';

// QueueModule is global, so JobService needs no import here.
@Module({
  imports: [
    TypeOrmModule.forFeature([User, ApiKey, Tenant]),
    AuthModule,
    PostModule,
    CredentialsModule,
    UploadModule,
    AIInsightsModule,
  ],
  controllers: MCP_CONTROLLERS,
  providers: MCP_PROVIDERS,
})
export class McpModule {}
