import {
  Controller,
  Get,
  Post,
  Query,
  // Req,
  Res,
  UseGuards,
  Body,
  Delete,
  Param,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CredentialsService } from './credential.service';
import { PlatformName } from '../entities/credential.entity';
import { OAuthService } from './oauth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Controller('credentials')
export class CredentialsController {
  constructor(
    private credentialsService: CredentialsService,
    private oauthService: OAuthService,
  ) {}

  /**
   * Get OAuth authorization URL (Step 1)
   */
  @Post('oauth/authorize-url')
  @UseGuards(AuthGuard('jwt'))
  async getOAuthUrl(
    @CurrentUser() user: User,
    @Body('platform') platform: PlatformName,
    @Body('credentialName') credentialName: string,
  ): Promise<{ authUrl: string; state: string }> {
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
        platform,
        credentialName,
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
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Decode state
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId, platform, credentialName } = stateData;

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

      // Redirect to success page
      res.redirect(
        `${process.env.FRONTEND_URL}/settings?credential=connected&platform=${platform}`,
      );
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/settings?credential=error`);
    }
  }

  /**
   * Get user's credentials
   */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getUserCredentials(
    @CurrentUser() user: User,
    @Query('platform') platform?: PlatformName,
  ) {
    const credentials = await this.credentialsService.getUserCredentials(
      user.id,
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
  @UseGuards(AuthGuard('jwt'))
  async testCredential(
    @CurrentUser() user: User,
    @Param('id') credentialId: string,
  ) {
    const isValid = await this.credentialsService.testConnection(
      credentialId,
      user.id,
    );
    return { valid: isValid };
  }

  /**
   * Delete credential
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteCredential(
    @CurrentUser() user: User,
    @Param('id') credentialId: string,
  ) {
    await this.credentialsService.deleteCredential(credentialId, user.id);
    return { success: true };
  }
}
