import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  Credential,
  PlatformName,
  CredentialType,
} from '../entities/credential.entity';
import * as crypto from 'crypto';

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectRepository(Credential)
    private credentialRepository: Repository<Credential>,
    private configService: ConfigService,
  ) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    this.encryptionKey = crypto.createHash('sha256').update(key!).digest();
  }

  /**
   * Encrypt sensitive credential data
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt credential data
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Save OAuth2 credentials
   */
  async saveOAuthCredential(
    userId: string,
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
    credential.platform = platform;
    credential.type = CredentialType.OAUTH2;
    credential.name = name;
    credential.accessToken = this.encrypt(oauthData.accessToken);
    credential.refreshToken = oauthData.refreshToken
      ? this.encrypt(oauthData.refreshToken)
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
    credential.encryptedData = this.encrypt(JSON.stringify(oauthData));

    return this.credentialRepository.save(credential);
  }

  /**
   * Get credential by ID
   */
  async getCredential(
    credentialId: string,
    userId: string,
  ): Promise<Credential | null> {
    return this.credentialRepository.findOne({
      where: { id: credentialId, userId },
    });
  }

  /**
   * Get decrypted access token
   */
  async getAccessToken(credentialId: string, userId: string): Promise<string> {
    const credential = await this.getCredential(credentialId, userId);
    if (!credential) {
      throw new Error('Credential not found');
    }
    // If no refresh token, assume long-lived access token (e.g., Instagram)
    if (!credential.refreshToken) {
      // Optional: check expiry
      if (credential.tokenExpiresAt && credential.tokenExpiresAt < new Date()) {
        throw new Error('Access token expired and no refresh token available');
      }
      return this.decrypt(credential.accessToken!);
    }
    // Check if token is expired and refresh if needed
    if (this.isTokenExpired(credential)) {
      await this.refreshAccessToken(credential);
      // Reload credential after refresh
      return this.getAccessToken(credentialId, userId);
    }

    return this.decrypt(credential.accessToken!);
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
  private async refreshAccessToken(credential: Credential): Promise<void> {
    if (!credential.refreshToken) {
      throw new Error('No refresh token available');
    }

    this.logger.log(`Refreshing token for credential ${credential.id}`);

    const refreshToken = this.decrypt(credential.refreshToken);

    // Call platform-specific refresh endpoint
    const newTokenData = await this.refreshTokenByPlatform(
      credential.platform,
      refreshToken,
    );

    // Update credential
    credential.accessToken = this.encrypt(newTokenData.accessToken);
    if (newTokenData.refreshToken) {
      credential.refreshToken = this.encrypt(newTokenData.refreshToken);
    }
    credential.tokenExpiresAt = new Date(
      Date.now() + newTokenData.expiresIn * 1000,
    );

    await this.credentialRepository.save(credential);
  }

  /**
   * Platform-specific token refresh
   */
  private async refreshTokenByPlatform(
    platform: PlatformName,
    refreshToken: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    // Implement platform-specific refresh logic
    switch (platform) {
      case PlatformName.X:
        return this.refreshTwitterToken(refreshToken);
      case PlatformName.FACEBOOK:
      case PlatformName.INSTAGRAM:
        return this.refreshFacebookToken(refreshToken);
      // Add other platforms
      default:
        throw new Error(`Token refresh not implemented for ${platform}`);
    }
  }

  private async refreshTwitterToken(refreshToken: string): Promise<any> {
    // Implement Twitter OAuth2 token refresh
    throw new Error('Not implemented');
  }

  private async refreshFacebookToken(refreshToken: string): Promise<any> {
    // Implement Facebook token refresh
    throw new Error('Not implemented');
  }

  /**
   * Get all credentials for a user
   */
  async getUserCredentials(
    userId: string,
    platform?: PlatformName,
  ): Promise<Credential[]> {
    const where: any = { userId, isActive: true };
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
  async deleteCredential(credentialId: string, userId: string): Promise<void> {
    await this.credentialRepository.delete({ id: credentialId, userId });
  }

  /**
   * Test credential connection
   */
  async testConnection(credentialId: string, userId: string): Promise<boolean> {
    const credential = await this.getCredential(credentialId, userId);
    const access_token = await this.getAccessToken(credentialId, userId);

    // Test based on platform
    switch (credential!.platform) {
      case PlatformName.X:
        return this.testTwitterConnection(access_token);
      case PlatformName.FACEBOOK:
        return this.testFacebookConnection(access_token);
      case PlatformName.INSTAGRAM:
        return this.testFacebookConnection(access_token);
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
}
