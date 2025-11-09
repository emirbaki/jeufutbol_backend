import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PlatformName } from '../entities/credential.entity';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope: string[];
}

@Injectable()
export class OAuthService {
  private configs: Map<PlatformName, OAuthConfig>;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.initializeConfigs();
  }

  private initializeConfigs() {
    const baseUrl = this.configService.get('API_URL');
    if (!baseUrl) throw new Error('API_URL environment variable is not set');

    const twitterClientId = this.configService.get('X_CLIENT_ID');
    const twitterClientSecret = this.configService.get('X_CLIENT_SECRET');
    const facebookClientId = this.configService.get('FACEBOOK_APP_ID');
    const facebookClientSecret = this.configService.get('FACEBOOK_APP_SECRET');
    const instagramClientId = this.configService.get('INSTAGRAM_APP_ID');
    const instagramClientSecret = this.configService.get(
      'INSTAGRAM_APP_SECRET',
    );
    const tiktokClientId = this.configService.get('TIKTOK_CLIENT_KEY');
    const tiktokClientSecret = this.configService.get('TIKTOK_CLIENT_SECRET');

    if (
      !twitterClientId ||
      !twitterClientSecret ||
      !facebookClientId ||
      !facebookClientSecret ||
      !instagramClientId ||
      !instagramClientSecret ||
      !tiktokClientId ||
      !tiktokClientSecret
    ) {
      throw new Error(
        'OAuth credentials not properly configured in environment variables',
      );
    }

    this.configs = new Map([
      [
        PlatformName.X,
        {
          clientId: this.configService.get('X_CLIENT_ID')!,
          clientSecret: this.configService.get('X_CLIENT_SECRET')!,
          authUrl: 'https://x.com/i/oauth2/authorize',
          tokenUrl: 'https://api.x.com/2/oauth2/token',
          redirectUri: `${baseUrl}/api/credentials/oauth/callback`,
          scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        },
      ],
      [
        PlatformName.FACEBOOK,
        {
          clientId: this.configService.get('FACEBOOK_APP_ID')!,
          clientSecret: this.configService.get('FACEBOOK_APP_SECRET')!,
          authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
          redirectUri: `${baseUrl}/api/credentials/oauth/callback`,
          scope: [
            'pages_manage_posts',
            'pages_read_engagement',
            'instagram_basic',
            'instagram_content_publish',
          ],
        },
      ],
      [
        PlatformName.INSTAGRAM,
        {
          clientId: this.configService.get('INSTAGRAM_APP_ID')!,
          clientSecret: this.configService.get('INSTAGRAM_APP_SECRET')!,
          authUrl: 'https://www.instagram.com/oauth/authorize',
          tokenUrl: 'https://api.instagram.com/oauth/access_token',
          redirectUri: `${baseUrl}/api/credentials/oauth/callback`,
          scope: [
            'instagram_business_basic',
            'instagram_business_content_publish',
          ],
        },
      ],
      [
        PlatformName.TIKTOK,
        {
          clientId: this.configService.get('TIKTOK_CLIENT_KEY')!,
          clientSecret: this.configService.get('TIKTOK_CLIENT_SECRET')!,
          authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
          tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
          redirectUri: `${baseUrl}/api/credentials/oauth/callback`,
          scope: [
            'user.info.basic',
            'video.upload',
            'user.info.profile',
            'user.info.stats',
            'video.list',
          ],
        },
      ],
    ]);
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(platform: PlatformName, state: string): string {
    const config = this.configs.get(platform);
    if (!config) {
      throw new Error(`OAuth not configured for ${platform}`);
    }

    let params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope.join(','),
      state,
    });

    // if (platform === PlatformName.INSTAGRAM) {
    //   params = new URLSearchParams({
    //     client_id: config.clientId,
    //     redirect_uri: config.redirectUri,
    //     response_type: 'code',
    //     scope: config.scope.join(','),
    //     state,
    //   });
    //   params.append('display', 'popup');
    //   params.append('extras', JSON.stringify({"setup":{"channel":"IG_API_ONBOARDING"}}));
    // }

    // Platform-specific additions
    if (platform === PlatformName.X) {
      params.append('code_challenge', 'challenge');
      params.append('code_challenge_method', 'plain');
      params.set('scope', config.scope.join('%20'));
    } else if (platform === PlatformName.TIKTOK) {
      params = new URLSearchParams({
        client_key: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scope.join(','),
        state,
      });
    }
    console.log(`${config.authUrl}?${decodeURIComponent(params.toString())}`);
    return `${config.authUrl}?${decodeURIComponent(params.toString())}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    platform: PlatformName,
    code: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scope?: string[];
  }> {
    const config = this.configs.get(platform);
    if (!config) {
      throw new Error(`OAuth not configured for ${platform}`);
    }

    let params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    });

    if (platform === PlatformName.X) {
      params.set('code_verifier', 'challenge');
    } else if (platform === PlatformName.TIKTOK) {
      params = new URLSearchParams({
        client_key: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      });
    }
    const credentials = Buffer.from(
      `${this.configService.get('X_CLIENT_ID')}:${this.configService.get('X_CLIENT_SECRET')}`,
    ).toString('base64');
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    };
    const response = await firstValueFrom(
      this.httpService.post(config.tokenUrl, params.toString(), {
        headers:
          platform === PlatformName.X
            ? headers
            : {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
      }),
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in || 3600,
      scope: response.data.scope?.split(' '),
    };
  }

  /**
   * Get account information
   */
  async getAccountInfo(
    platform: PlatformName,
    accessToken: string,
  ): Promise<{
    id: string;
    name: string;
    image?: string;
  }> {
    switch (platform) {
      case PlatformName.X:
        return this.getTwitterAccountInfo(accessToken);
      case PlatformName.FACEBOOK:
        return this.getFacebookAccountInfo(accessToken);
      case PlatformName.INSTAGRAM:
        return this.getInstagramAccountInfo(accessToken);
      case PlatformName.TIKTOK:
        return this.getTiktokAccountInfo(accessToken);
      // Add other platforms
      default:
        throw new Error(`Account info not implemented for ${platform}`);
    }
  }

  private async getTwitterAccountInfo(accessToken: string) {
    const response = await firstValueFrom(
      this.httpService.get('https://api.x.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { 'user.fields': 'profile_image_url' },
      }),
    );

    return {
      id: response.data.data.id,
      name: response.data.data.username,
      image: response.data.data.profile_image_url,
    };
  }

  private async getFacebookAccountInfo(accessToken: string) {
    const response = await firstValueFrom(
      this.httpService.get('https://graph.facebook.com/me', {
        params: {
          access_token: accessToken,
          fields: 'id,name,picture',
        },
      }),
    );

    return {
      id: response.data.id,
      name: response.data.name,
      image: response.data.picture?.data?.url,
    };
  }

  private async getInstagramAccountInfo(accessToken: string) {
    const response = await firstValueFrom(
      this.httpService.get('https://graph.instagram.com/me', {
        params: {
          access_token: accessToken,
          fields: 'id,username,profile_picture_url',
        },
      }),
    );

    return {
      id: response.data.id,
      name: response.data.username,
      image: response.data.profile_picture_url,
    };
  }

  private async getTiktokAccountInfo(accessToken: string) {
    const response = await firstValueFrom(
      this.httpService.get('https://open.tiktokapis.com/v2/user/info/', {
        params: {
          fields: 'open_id,username,avatar_url',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }),
    );

    return {
      id: response.data.data.user.open_id,
      name: response.data.data.user.username,
      image: response.data.data.user.avatar_url,
    };
  }
}
