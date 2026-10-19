import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UserInvitation } from '../entities/user-invitation.entity';
import { Tenant } from '../entities/tenant.entity';
import { UserResolver } from './user.resolver';
import { EmailModule } from '../email/email.module';
import { EmailService } from '../email/email.service';
import { ApiKey } from '../entities/api-key.entity';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { UserAvatarController } from './user-avatar.controller';

import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserInvitation, Tenant, ApiKey]), EmailModule, AuthModule, UploadModule, WorkspacesModule],
  controllers: [UserAvatarController],
  providers: [UserResolver, EmailService],
  exports: [],
})
export class UserModule { }
