import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Credential,
  PlatformName,
  CredentialType,
} from '../entities/credential.entity';
import { EncryptionService } from './token-encryption.service';
import { TokenRefreshService } from './token-refresher.service';

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectRepository(Credential)
    private credentialRepository: Repository<Credential>,
    private encryptionService: EncryptionService,
    private tokenRefreshService: TokenRefreshService,
  ) {}

  /**
   * Save OAuth2 credentials
   */
  async saveOAuthCredential(
    userId: string,
    tenantId: string,
    platform: PlatformName,
    name: string,
    oauthData: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      accountId: string;
      accountName: string;
      accountImage?: string;
      scope?: string[];
    },
  ): Promise<Credential> {
    const credential = new Credential();
    credential.userId = userId;
    credential.tenantId = tenantId;
    credential.platform = platform;
    credential.type = CredentialType.OAUTH2;
    credential.name = name;
    credential.accessToken = this.encryptionService.encrypt(
      oauthData.accessToken,
    );
    credential.refreshToken = oauthData.refreshToken
      ? this.encryptionService.encrypt(oauthData.refreshToken)
      : null;
    credential.tokenExpiresAt = oauthData.expiresIn
      ? new Date(Date.now() + oauthData.expiresIn * 1000)
      : null;
    credential.accountId = oauthData.accountId;
    credential.accountName = oauthData.accountName;
    credential.accountImage = oauthData.accountImage!;
    credential.metadata = {
      scope: oauthData.scope || [],
      grantedAt: new Date(),
    };
    credential.encryptedData = this.encryptionService.encrypt(
      JSON.stringify(oauthData),
    );

    return this.credentialRepository.save(credential);
  }

  /**
   * Get credential by ID
   */
  async getCredential(
    credentialId: string,
    userId: string,
    tenantId: string,
  ): Promise<Credential | null> {
    return this.credentialRepository.findOne({
      where: { id: credentialId, userId, tenantId },
    });
  }

  /**
   * Get decrypted access token
   */
  async getAccessToken(
    credentialId: string,
    userId: string,
    tenantId: string,
  ): Promise<string> {
    const credential = await this.getCredential(credentialId, userId, tenantId);
    if (!credential) {
      throw new Error('Credential not found');
    }
    // If no refresh token, assume long-lived access token (e.g., Instagram)
    if (!credential.refreshToken) {
      // Optional: check expiry
      if (credential.tokenExpiresAt && credential.tokenExpiresAt < new Date()) {
        throw new Error('Access token expired and no refresh token available');
      }
      return this.encryptionService.decrypt(credential.accessToken!);
    }
    // Check if token is expired and refresh if needed
    if (this.isTokenExpired(credential)) {
      await this.refreshAccessToken(credentialId, userId, tenantId);
      // Reload credential after refresh
      return this.getAccessToken(credentialId, userId, tenantId);
    }

    return this.encryptionService.decrypt(credential.accessToken!);
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(credential: Credential): boolean {
    if (!credential.tokenExpiresAt) return false;

    // Consider token expired 5 minutes before actual expiry
    const bufferTime = 5 * 60 * 1000;
    return Date.now() >= credential.tokenExpiresAt.getTime() - bufferTime;
  }

  /**
   * Refresh access token
   */
  public async refreshAccessToken(
    credentialId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const credential = await this.getCredential(credentialId, userId, tenantId);

    if (!credential!.refreshToken) {
      throw new Error('No refresh token available');
    }
    this.logger.log(`Refreshing token for credential ${credential!.id}`);

    // Call platform-specific refresh endpoint
    const newTokenData = await this.refreshTokenByPlatform(credential!);

    // Update credential
    credential!.accessToken = this.encryptionService.encrypt(
      newTokenData.accessToken,
    );
    if (newTokenData.refreshToken) {
      credential!.refreshToken = this.encryptionService.encrypt(
        newTokenData.refreshToken,
      );
    }
    credential!.tokenExpiresAt = new Date(
      Date.now() + newTokenData.expiresIn * 1000,
    );

    await this.credentialRepository.save(credential!);
  }

  /**
   * Platform-specific token refresh
   */
  private async refreshTokenByPlatform(credential: Credential): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    const platform = credential.platform;
    // Implement platform-specific refresh logic
    switch (platform) {
      case PlatformName.X:
        return this.tokenRefreshService.refreshTwitterToken(credential);
      case PlatformName.FACEBOOK:
        return this.tokenRefreshService.refreshFacebookToken(credential);
      case PlatformName.INSTAGRAM:
        return this.tokenRefreshService.refreshInstagramToken(credential);
      case PlatformName.TIKTOK:
        return this.tokenRefreshService.refreshTiktokToken(credential);
      // Add other platforms
      default:
        throw new Error(`Token refresh not implemented for ${platform}`);
    }
  }

  /**
   * Get all credentials for a user
   */
  async getUserCredentials(
    userId: string,
    tenantId: string,
    platform?: PlatformName,
  ): Promise<Credential[]> {
    const where: any = { userId, tenantId, isActive: true };
    if (platform) {
      where.platform = platform;
    }

    return this.credentialRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Delete credential
   */
  async deleteCredential(
    credentialId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    await this.credentialRepository.delete({
      id: credentialId,
      userId,
      tenantId,
    });
  }

  /**
   * Test credential connection
   */
  async testConnection(
    credentialId: string,
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const credential = await this.getCredential(credentialId, userId, tenantId);
    const access_token = await this.getAccessToken(
      credentialId,
      userId,
      tenantId,
    );

    // Test based on platform
    switch (credential!.platform) {
      case PlatformName.X:
        return this.testTwitterConnection(access_token);
      case PlatformName.FACEBOOK:
        return this.testFacebookConnection(access_token);
      case PlatformName.INSTAGRAM:
        return this.testFacebookConnection(access_token);
      case PlatformName.TIKTOK:
        return this.testTiktokConnection(access_token);
      // Add other platforms
      default:
        return false;
    }
  }

  private async testTwitterConnection(accessToken: string): Promise<boolean> {
    // Test Twitter API connection
    return true;
  }

  private async testFacebookConnection(accessToken: string): Promise<boolean> {
    // Test Facebook API connection
    return true;
  }

  private async testTiktokConnection(accessToken: string): Promise<boolean> {
    // Test Facebook API connection
    return true;
  }
}
