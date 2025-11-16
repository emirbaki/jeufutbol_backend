import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Credential } from '../entities/credential.entity';
import { EncryptionService } from './token-encryption.service';

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Refresh Twitter/X OAuth2 token
   */
  async refreshTwitterToken(credential: Credential): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    try {
      const refreshToken = this.encryptionService.decrypt(
        credential.refreshToken!,
      );
      const clientId = this.configService.get('X_CLIENT_ID');
      const clientSecret = this.configService.get('X_CLIENT_SECRET');

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.x.com/2/oauth2/token',
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${credentials}`,
            },
          },
        ),
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token, // Twitter returns a new refresh token
        expiresIn: response.data.expires_in || 7200,
      };
    } catch (error) {
      this.logger.error('Twitter token refresh failed:', error);
      throw new Error('Failed to refresh Twitter token');
    }
  }

  /**
   * Refresh Facebook token
   * Facebook uses a different approach - exchange short-lived for long-lived tokens
   */
  async refreshFacebookToken(credential: Credential): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    try {
      const currentAccessToken = this.encryptionService.decrypt(
        credential.accessToken!,
      );
      const appId = this.configService.get('FACEBOOK_APP_ID');
      const appSecret = this.configService.get('FACEBOOK_APP_SECRET');

      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId!,
        client_secret: appSecret!,
        fb_exchange_token: currentAccessToken,
      });

      const response = await firstValueFrom(
        this.httpService.get(
          'https://graph.facebook.com/v18.0/oauth/access_token',
          { params },
        ),
      );

      return {
        accessToken: response.data.access_token,
        // Facebook doesn't return refresh tokens, just long-lived access tokens
        expiresIn: response.data.expires_in || 5184000, // ~60 days
      };
    } catch (error) {
      this.logger.error('Facebook token refresh failed:', error);
      throw new Error('Failed to refresh Facebook token');
    }
  }

  /**
   * Refresh Instagram token
   * Instagram uses long-lived tokens that can be refreshed before expiry
   */
  async refreshInstagramToken(credential: Credential): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    try {
      const currentAccessToken = this.encryptionService.decrypt(
        credential.accessToken!,
      );

      // Instagram Basic Display API refresh
      const params = new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: currentAccessToken,
      });

      const response = await firstValueFrom(
        this.httpService.get(
          'https://graph.instagram.com/refresh_access_token',
          {
            params,
          },
        ),
      );

      return {
        accessToken: response.data.access_token,
        // Instagram doesn't provide refresh tokens, only refreshed access tokens
        expiresIn: response.data.expires_in || 5184000, // ~60 days
      };
    } catch (error) {
      this.logger.error('Instagram token refresh failed:', error);

      // Fallback: Try Facebook Graph API for Instagram Business accounts
      try {
        return await this.refreshInstagramBusinessToken(credential);
      } catch (fallbackError) {
        this.logger.error(
          'Instagram Business token refresh also failed:',
          fallbackError,
        );
        throw new Error('Failed to refresh Instagram token');
      }
    }
  }

  /**
   * Refresh Instagram Business account token (via Facebook)
   */
  private async refreshInstagramBusinessToken(credential: Credential): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    const currentAccessToken = this.encryptionService.decrypt(
      credential.accessToken!,
    );
    const appId = this.configService.get('FACEBOOK_APP_ID');
    const appSecret = this.configService.get('FACEBOOK_APP_SECRET');

    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId!,
      client_secret: appSecret!,
      fb_exchange_token: currentAccessToken,
    });

    const response = await firstValueFrom(
      this.httpService.get(
        'https://graph.facebook.com/v18.0/oauth/access_token',
        { params },
      ),
    );

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in || 5184000,
    };
  }

  /**
   * Refresh TikTok token
   */
  async refreshTiktokToken(credential: Credential): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    try {
      const refreshToken = this.encryptionService.decrypt(
        credential.refreshToken!,
      );
      const clientKey = this.configService.get('TIKTOK_CLIENT_KEY');
      const clientSecret = this.configService.get('TIKTOK_CLIENT_SECRET');

      const params = new URLSearchParams({
        client_key: clientKey!,
        client_secret: clientSecret!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          'https://open.tiktokapis.com/v2/oauth/token/',
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      return {
        accessToken: response.data.data.access_token,
        refreshToken: response.data.data.refresh_token, // TikTok returns a new refresh token
        expiresIn: response.data.data.expires_in || 86400, // 24 hours
      };
    } catch (error) {
      this.logger.error('TikTok token refresh failed:', error);
      throw new Error('Failed to refresh TikTok token');
    }
  }
}
