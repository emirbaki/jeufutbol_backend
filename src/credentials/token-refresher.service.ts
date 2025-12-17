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
  ) { }

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
   * Uses Instagram Basic Display API / Instagram Login mechanism
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
      // Instagram refresh doesn't strictly need client_secret in some versions, 
      // but usually just access_token and grant_type.

      const params = new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: currentAccessToken,
      });

      const response = await firstValueFrom(
        this.httpService.get(
          'https://graph.instagram.com/refresh_access_token',
          { params },
        ),
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in || 5184000, // ~60 days
      };
    } catch (error) {
      this.logger.error('Instagram token refresh failed:', error);
      throw new Error('Failed to refresh Instagram token');
    }
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

      this.logger.log(`Refreshing TikTok token for credential ${credential.id}`);

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

      this.logger.log(`TikTok refresh response: ${JSON.stringify(response.data)}`);

      // TikTok v2 API returns error in response.data.error structure
      if (response.data.error) {
        this.logger.error(`TikTok API Error: ${response.data.error} - ${response.data.error_description}`);
        throw new Error(`TikTok API Error: ${response.data.error_description || response.data.error}`);
      }

      // TikTok v2 returns data nested under response.data (not response.data.data for some endpoints)
      const tokenData = response.data.data || response.data;

      if (!tokenData.access_token) {
        this.logger.error(`TikTok response missing access_token: ${JSON.stringify(response.data)}`);
        throw new Error('TikTok response missing access_token');
      }

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token, // TikTok returns a new refresh token
        expiresIn: tokenData.expires_in || 86400, // 24 hours
      };
    } catch (error: any) {
      // Log the full error details including axios response data
      const errorDetails = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      this.logger.error(`TikTok token refresh failed: ${errorDetails}`, error.stack);
      throw new Error(`Failed to refresh TikTok token: ${errorDetails}`);
    }
  }

  /**
   * Refresh YouTube/Google token
   * Uses Google OAuth2 refresh token flow
   */
  async refreshYoutubeToken(credential: Credential): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    try {
      const refreshToken = this.encryptionService.decrypt(
        credential.refreshToken!,
      );
      const clientId = this.configService.get('YOUTUBE_CLIENT_ID');
      const clientSecret = this.configService.get('YOUTUBE_CLIENT_SECRET');

      const params = new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          'https://oauth2.googleapis.com/token',
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      return {
        accessToken: response.data.access_token,
        // Google doesn't always return a new refresh token
        refreshToken: response.data.refresh_token || undefined,
        expiresIn: response.data.expires_in || 3600, // 1 hour default
      };
    } catch (error) {
      this.logger.error('YouTube token refresh failed:', error);
      throw new Error('Failed to refresh YouTube token');
    }
  }
}
