import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../entities/workspace.entity';
import { Credential } from '../entities/credential.entity';
import { Post } from '../entities/post.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { Tenant } from '../entities/tenant.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Insight } from '../entities/insight.entity';
import { ChatSession } from '../insights/entities/chat-session.entity';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesResolver } from './workspaces.resolver';
import { ActiveWorkspacePipe } from './active-workspace.decorator';

@Module({
  imports: [TypeOrmModule.forFeature([
      Workspace,
      Credential,
      Post,
      MonitoredProfile,
      Insight,
      ChatSession,
      User,
      ApiKey,
      Tenant,
    ]), AuthModule],
  providers: [WorkspacesService, WorkspacesResolver, ActiveWorkspacePipe],
  exports: [WorkspacesService, ActiveWorkspacePipe],
})
export class WorkspacesModule {}
