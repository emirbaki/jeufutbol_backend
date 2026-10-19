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
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import { WorkspaceImageController } from './workspace-image.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([
      Workspace,
      Credential,
      Post,
      MonitoredProfile,
      Insight,
      ChatSession,
      WorkspaceMember,
      User,
      ApiKey,
      Tenant,
    ]), AuthModule, UploadModule],
  controllers: [WorkspaceImageController],
  providers: [WorkspacesService, WorkspacesResolver, ActiveWorkspacePipe, WorkspaceAccessService],
  exports: [WorkspacesService, ActiveWorkspacePipe, WorkspaceAccessService],
})
export class WorkspacesModule {}
