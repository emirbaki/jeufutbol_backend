import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';
import { Tenant } from '../entities/tenant.entity';
import { UserRole } from './user-role.enum';
import { User } from '../entities/user.entity';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private emailService: EmailService,
    private jwtService: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    organizationName: string,
  ) {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Tenant
    // Simple slug generation: lowercase, replace spaces with dashes, remove non-alphanumeric
    let subdomain = organizationName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    // Ensure subdomain is unique (simple check, might need retry logic in prod)
    const existingTenant = await this.tenantRepository.findOne({
      where: { subdomain },
    });
    if (existingTenant) {
      subdomain = `${subdomain}-${uuidv4().substring(0, 4)}`;
    }

    const tenant = this.tenantRepository.create({
      name: organizationName,
      subdomain: subdomain,
    });
    await this.tenantRepository.save(tenant);

    // Generate verification token
    const verificationToken = uuidv4();
    const verificationTokenExpiry = new Date();
    verificationTokenExpiry.setHours(verificationTokenExpiry.getHours() + 24); // 24 hours

    // Create user
    const user = this.userRepository.create({
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      verificationToken,
      verificationTokenExpiry,
      isVerified: false,
      tenant: tenant, // Assign to new tenant
      tenantId: tenant.id,
      role: UserRole.ADMIN, // Creator is always ADMIN
    });

    await this.userRepository.save(user);

    // Send verification email
    const userName = `${firstName} ${lastName}`;
    await this.emailService.sendVerificationEmail(
      email,
      userName,
      verificationToken,
    );

    return {
      message:
        'Registration successful! Please check your email to verify your account.',
    };
  }

  async verifyEmail(token: string) {
    const user = await this.userRepository.findOne({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    if (user.verificationTokenExpiry! < new Date()) {
      throw new BadRequestException(
        'Verification token has expired. Please request a new one.',
      );
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Update user
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpiry = null;
    await this.userRepository.save(user);

    // Send welcome email
    const userName = `${user.firstName} ${user.lastName}`;
    await this.emailService.sendWelcomeEmail(user.email, userName);

    return { message: 'Email verified successfully! You can now login.' };
  }

  async login(email: string, password: string) {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['tenant'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in. Check your inbox for the verification link.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      user,
      accessToken,
    };
  }

  async requestPasswordReset(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if user exists for security
      return {
        message: 'This user is not registered with us.',
      };
    }

    // Generate reset token
    const resetToken = uuidv4();
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await this.userRepository.save(user);

    // Send password reset email
    const userName = `${user.firstName} ${user.lastName}`;
    await this.emailService.sendPasswordResetEmail(email, userName, resetToken);

    return {
      message:
        'If that email exists in our system, a password reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userRepository.findOne({
      where: { resetToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset token');
    }

    if (user.resetTokenExpiry! < new Date()) {
      throw new BadRequestException(
        'Reset token has expired. Please request a new one.',
      );
    }

    // Validate password strength (optional)
    if (newPassword.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }

    // Update password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await this.userRepository.save(user);

    return {
      message:
        'Password reset successfully! You can now login with your new password.',
    };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new verification token
    const verificationToken = uuidv4();
    const verificationTokenExpiry = new Date();
    verificationTokenExpiry.setHours(verificationTokenExpiry.getHours() + 24);

    user.verificationToken = verificationToken;
    user.verificationTokenExpiry = verificationTokenExpiry;
    await this.userRepository.save(user);

    // Send new verification email
    const userName = `${user.firstName} ${user.lastName}`;
    await this.emailService.sendVerificationEmail(
      email,
      userName,
      verificationToken,
    );

    return { message: 'Verification email sent! Please check your inbox.' };
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['tenant'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
export interface JwtPayload {
  sub: string;
  email: string;
}
