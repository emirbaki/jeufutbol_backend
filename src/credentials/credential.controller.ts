import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Body,
  Delete,
  Param,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CredentialsService } from './credential.service';
import { PlatformName } from '../entities/credential.entity';
import { OAuthService } from './oauth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKey } from '../entities/api-key.entity';

@Controller('credentials')
export class CredentialsController {
  constructor(
    private credentialsService: CredentialsService,
    private oauthService: OAuthService,
  ) { }

  /**
   * Get OAuth authorization URL (Step 1)
   */
  @Post('oauth/authorize-url')
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:write')
  async getOAuthUrl(
    @Req() req: Request,
    @Body('platform') platform: PlatformName,
    @Body('credentialName') credentialName: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ): Promise<{ authUrl: string; state: string }> {
    const userId = user?.id || apiKey?.createdByUserId;
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!userId) {
      throw new Error('User context required');
    }
    const origin = req.get('origin') || req.get('referer')?.split('/').slice(0, 3).join('/');
    const frontendUrl = origin || process.env.FRONTEND_URL || 'http://localhost:4200';

    const state = Buffer.from(
      JSON.stringify({
        userId,
        tenantId,
        platform,
        credentialName,
        frontendUrl, // Store origin in state
        timestamp: Date.now(),
      }),
    ).toString('base64');

    const authUrl = this.oauthService.getAuthorizationUrl(platform, state);

    return { authUrl, state };
  }

  /**
   * OAuth callback handler (Step 2)
   */
  @Get('oauth/callback')
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Decode state
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId, tenantId, platform, credentialName, frontendUrl: storedFrontendUrl } = stateData;

      // Exchange code for tokens
      const tokenData = await this.oauthService.exchangeCodeForToken(
        platform,
        code,
      );

      // Get account info
      const accountInfo = await this.oauthService.getAccountInfo(
        platform,
        tokenData.accessToken,
      );

      // Save credential
      await this.credentialsService.saveOAuthCredential(
        userId,
        tenantId,
        platform,
        credentialName || `${platform} - ${accountInfo.name}`,
        {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresIn: tokenData.expiresIn,
          accountId: accountInfo.id,
          accountName: accountInfo.name,
          accountImage: accountInfo.image,
          scope: tokenData.scope,
        },
      );

      // Use stored frontend URL or fallback
      const frontendUrl = storedFrontendUrl || process.env.FRONTEND_URL || 'http://localhost:4200';

      // Redirect to frontend callback route
      const redirectUrl = new URL(`${frontendUrl}/oauth/callback`);
      redirectUrl.searchParams.append('status', 'success');
      redirectUrl.searchParams.append('platform', platform);
      redirectUrl.searchParams.append('credentialName', credentialName || accountInfo.name);

      res.redirect(redirectUrl.toString());
    } catch (error: any) {
      console.error('OAuth callback error:', error);

      // Try to recover frontend URL from state if possible, otherwise fallback
      let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        if (stateData.frontendUrl) frontendUrl = stateData.frontendUrl;
      } catch (e) { }

      const redirectUrl = new URL(`${frontendUrl}/oauth/callback`);
      redirectUrl.searchParams.append('status', 'error');
      redirectUrl.searchParams.append('error', error.message || 'Failed to connect account');

      res.redirect(redirectUrl.toString());
    }
  }

  /**
   * Get user's credentials
   */
  @Get()
  @Get()
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:read')
  async getUserCredentials(
    @Query('platform') platform?: PlatformName,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!userId || !tenantId) throw new Error('User context required');

    const credentials = await this.credentialsService.getUserCredentials(
      userId,
      tenantId,
      platform,
    );

    // Remove sensitive data before sending to frontend
    return credentials.map((cred) => ({
      id: cred.id,
      name: cred.name,
      platform: cred.platform,
      type: cred.type,
      accountId: cred.accountId,
      accountName: cred.accountName,
      accountImage: cred.accountImage,
      isActive: cred.isActive,
      tokenExpiresAt: cred.tokenExpiresAt,
      createdAt: cred.createdAt,
    }));
  }

  /**
   * Test credential connection
   */
  @Post(':id/test')
  @Post(':id/test')
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:read')
  async testCredential(
    @Param('id') credentialId: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!userId || !tenantId) throw new Error('User context required');

    const isValid = await this.credentialsService.testConnection(
      credentialId,
      userId,
      tenantId,
    );
    return { valid: isValid };
  }

  @Post(':id/refresh')
  @Post(':id/refresh')
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:write')
  async refreshTokenByPlatform(
    @Param('id') credentialId: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!userId || !tenantId) throw new Error('User context required');

    const refreshToken = await this.credentialsService.refreshAccessToken(
      credentialId,
      userId,
      tenantId,
    );

    return { refreshToken };
  }

  /**
   * Delete credential
   */
  @Delete(':id')
  @Delete(':id')
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:write')
  async deleteCredential(
    @Param('id') credentialId: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!userId || !tenantId) throw new Error('User context required');

    await this.credentialsService.deleteCredential(
      credentialId,
      userId,
      tenantId,
    );
    return { success: true };
  }
}
