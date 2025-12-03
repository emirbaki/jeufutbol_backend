import { registerEnumType } from '@nestjs/graphql';

export enum ApiKeyScope {
    // Posts
    POSTS_READ = 'posts:read',
    POSTS_WRITE = 'posts:write',
    POSTS_DELETE = 'posts:delete',

    // Insights
    INSIGHTS_READ = 'insights:read',
    INSIGHTS_GENERATE = 'insights:generate',

    // Monitoring
    MONITORING_READ = 'monitoring:read',
    MONITORING_WRITE = 'monitoring:write',

    // Credentials
    CREDENTIALS_READ = 'credentials:read',
    CREDENTIALS_WRITE = 'credentials:write',

    // Admin (full access)
    ADMIN = 'admin:*',
}

registerEnumType(ApiKeyScope, {
    name: 'ApiKeyScope',
    description: 'Available scopes for API key permissions',
});

export const ALL_SCOPES = Object.values(ApiKeyScope);
