import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('token')
    async getToken(
        @Body('grant_type') grantType: string,
        @Body('client_id') clientId: string,
        @Body('client_secret') clientSecret: string,
        @Body('scope') scope: string,
    ) {
        if (grantType !== 'client_credentials') {
            throw new BadRequestException('Unsupported grant type');
        }

        if (!clientSecret) {
            throw new BadRequestException('client_secret is required');
        }

        const scopes = scope ? scope.split(' ') : [];

        // 1. Try Tenant Credentials
        try {
            const tenant = await this.authService.validateClientCredentials(clientId, clientSecret);
            return this.authService.generateAccessTokenForTenant(tenant, scopes);
        } catch (error) {
            // 2. Fallback to API Key (where client_secret is the API Key)
            try {
                const apiKey = await this.authService.validateApiKey(clientId, clientSecret);
                return this.authService.generateAccessTokenForApiKey(apiKey);
            } catch (innerError) {
                throw new BadRequestException('Invalid client_id or client_secret');
            }
        }
    }
}
