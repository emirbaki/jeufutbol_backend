import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UserInvitation } from '../entities/user-invitation.entity';
import { Tenant } from '../entities/tenant.entity';
import { UserResolver } from './user.resolver';
import { EmailModule } from '../email/email.module';
import { EmailService } from '../email/email.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserInvitation, Tenant]), EmailModule],
  providers: [UserResolver, EmailService],
  exports: [],
})
export class UserModule { }
