import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../entities/workspace.entity';
import { Credential } from '../entities/credential.entity';
import { Post } from '../entities/post.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { Tenant } from '../entities/tenant.entity';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesResolver } from './workspaces.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, Credential, Post, User, ApiKey, Tenant]), AuthModule],
  providers: [WorkspacesService, WorkspacesResolver],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
