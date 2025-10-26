import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { SocialAccountsService } from './social-accounts.service';
import { PlatformType } from '../entities/social-account.entity';

@Controller('auth/social')
export class SocialAccountsController {
  constructor(private socialAccountsService: SocialAccountsService) {}

  // OAuth callback endpoints for each platform

  @Get('twitter/callback')
  async twitterCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      // Exchange code for access token
      // Get user info
      // Save account connection

      // Decode state to get userId
      const userId = Buffer.from(state, 'base64').toString('utf8');

      // This is simplified - you'll need to implement full OAuth flow
      const accessToken = 'received_from_oauth';
      const userData = {
        id: 'twitter_user_id',
        username: 'twitter_username',
        profile_image_url: 'image_url',
      };

      await this.socialAccountsService.connectAccount(
        userId,
        PlatformType.X,
        userData.id,
        userData.username,
        accessToken,
        undefined,
        undefined,
        userData.profile_image_url,
      );

      res.redirect('/dashboard?connected=twitter');
    } catch (error) {
      res.redirect('/dashboard?error=twitter_connection_failed');
    }
  }

  @Get('instagram/callback')
  async instagramCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    // Similar to Twitter callback
    res.redirect('/dashboard?connected=instagram');
  }

  @Get('facebook/callback')
  async facebookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    // Similar to Twitter callback
    res.redirect('/dashboard?connected=facebook');
  }
}
