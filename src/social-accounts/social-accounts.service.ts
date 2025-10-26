import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialAccount, PlatformType } from '../entities/social-account.entity';
import { EncryptionUtil } from '../utils/encryption.util';

@Injectable()
export class SocialAccountsService {
  constructor(
    @InjectRepository(SocialAccount)
    private socialAccountRepository: Repository<SocialAccount>,
  ) {}

  async connectAccount(
    userId: string,
    platform: PlatformType,
    platformUserId: string,
    platformUsername: string,
    accessToken: string,
    refreshToken?: string,
    tokenExpiresAt?: Date,
    profileImageUrl?: string,
  ): Promise<SocialAccount> {
    // Check if account already exists
    let account = await this.socialAccountRepository.findOne({
      where: { userId, platform, platformUserId },
    });

    const encryptedAccessToken = EncryptionUtil.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken
      ? EncryptionUtil.encrypt(refreshToken)
      : undefined;

    if (account) {
      // Update existing account
      account.encryptedAccessToken = encryptedAccessToken;
      if (encryptedRefreshToken !== undefined) {
        account.encryptedRefreshToken = encryptedRefreshToken;
      }
      if (tokenExpiresAt !== undefined) {
        account.tokenExpiresAt = tokenExpiresAt;
      }
      account.platformUsername = platformUsername;
      if (profileImageUrl !== undefined) {
        account.profileImageUrl = profileImageUrl;
      }
      account.isActive = true;
    } else {
      // Create new account
      account = this.socialAccountRepository.create({
        userId,
        platform,
        platformUserId,
        platformUsername,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        profileImageUrl,
        isActive: true,
      });
    }

    return this.socialAccountRepository.save(account);
  }

  async getConnectedAccounts(userId: string): Promise<SocialAccount[]> {
    return this.socialAccountRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async disconnectAccount(userId: string, accountId: string): Promise<boolean> {
    const account = await this.socialAccountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    account.isActive = false;
    await this.socialAccountRepository.save(account);
    return true;
  }

  async getDecryptedToken(accountId: string, userId: string): Promise<string> {
    const account = await this.socialAccountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return EncryptionUtil.decrypt(account.encryptedAccessToken);
  }
}
