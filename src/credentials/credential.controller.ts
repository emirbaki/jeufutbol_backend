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
  NotFoundException,
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
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { assertCanManageCredential } from './credential-access';
import { readWorkspaceHeader } from '../workspaces/active-workspace.decorator';

@Controller('credentials')
export class CredentialsController {
  constructor(
    private credentialsService: CredentialsService,
    private oauthService: OAuthService,
    private workspacesService: WorkspacesService,
    private accessService: WorkspaceAccessService,
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
    @Body('workspaceId') workspaceRef?: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ): Promise<{ authUrl: string; state: string }> {
    const userId = user?.id || apiKey?.createdByUserId;
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!userId || !tenantId) {
      throw new Error('User context required');
    }
    // Resolve now, so that a wrong workspace fails before the OAuth popup opens.
    const access = await this.accessService.accessFor(user, apiKey);
    const workspace = await this.workspacesService.resolve(tenantId, workspaceRef, access);
    const origin = req.get('origin') || req.get('referer')?.split('/').slice(0, 3).join('/');
    const frontendUrl = origin || process.env.FRONTEND_URL || 'http://localhost:4200';

    const state = Buffer.from(
      JSON.stringify({
        userId,
        tenantId,
        workspaceId: workspace.id,
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
      const { userId, tenantId, workspaceId, platform, credentialName, frontendUrl: storedFrontendUrl } = stateData;

      // A state from an old tab has no workspaceId. The lookup also checks the tenant.
      const workspace = await this.workspacesService.resolve(tenantId, workspaceId);

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
        workspace.id,
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
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:read')
  async listCredentials(
    @Req() req: Request,
    @Query('platform') platform?: PlatformName,
    @Query('workspaceId') workspaceRef?: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!tenantId) throw new Error('Tenant context required');

    // An explicit workspaceId wins. Else the X-Workspace-Id header filters.
    // Without both, a caller with access to all branches gets all accounts
    // (API callers do not change), and any other caller gets their active branch.
    const headerRef = readWorkspaceHeader(req as any);
    const access = await this.accessService.accessFor(user, apiKey);
    const workspaceId = workspaceRef
      ? (await this.workspacesService.resolve(tenantId, workspaceRef, access)).id
      : headerRef || access !== 'all'
        ? (await this.workspacesService.resolveActive(tenantId, { headerRef, user, apiKey, access })).id
        : undefined;
    const credentials = await this.credentialsService.listCredentials(tenantId, {
      workspaceId,
      platform,
    });

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
      workspaceId: cred.workspaceId,
      userId: cred.userId,
      createdAt: cred.createdAt,
    }));
  }

  /**
   * Test credential connection
   */
  @Post(':id/test')
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:read')
  async testCredential(
    @Param('id') credentialId: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!tenantId) throw new Error('Tenant context required');

    const isValid = await this.credentialsService.testConnection(
      credentialId,
      tenantId,
    );
    return { valid: isValid };
  }

  @Post(':id/refresh')
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:write')
  async refreshTokenByPlatform(
    @Param('id') credentialId: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!tenantId) throw new Error('Tenant context required');

    try {
      await this.credentialsService.refreshAccessToken(credentialId, tenantId);

      // Get updated credential to return new expiry info
      const credential = await this.credentialsService.getCredential(
        credentialId,
        tenantId,
      );

      return {
        success: true,
        tokenExpiresAt: credential?.tokenExpiresAt,
      };
    } catch (error: any) {
      console.error('Token refresh failed:', error);
      throw new Error(error.message || 'Failed to refresh token');
    }
  }

  /**
   * Delete credential
   */
  @Delete(':id')
  @UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
  @RequireScopes('credentials:write')
  async deleteCredential(
    @Param('id') credentialId: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const tenantId = user?.tenantId || apiKey?.tenantId;

    if (!tenantId) throw new Error('Tenant context required');

    const credential = await this.credentialsService.getCredential(credentialId, tenantId);
    if (!credential) throw new NotFoundException('Account not found.');
    assertCanManageCredential(user, credential);

    await this.credentialsService.deleteCredential(credentialId, tenantId);
    return { success: true };
  }
}
