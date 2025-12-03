import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { UserInvitation } from '../entities/user-invitation.entity';
import { ApiKey } from '../entities/api-key.entity';
import { EmailModule } from 'src/email/email.module';
import { EmailService } from 'src/email/email.service';
import { ApiKeyResolver } from './api-key.resolver';

import { AuthController } from './auth.controller';
import { CombinedAuthGuard } from './guards/combined-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Tenant, UserInvitation, ApiKey]),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthResolver, ApiKeyResolver, JwtStrategy, EmailService, CombinedAuthGuard],
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule, CombinedAuthGuard],
})
export class AuthModule { }
