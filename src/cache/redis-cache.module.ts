import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        let storeConfig: any = {};

        if (redisUrl) {
          // Parse REDIS_URL if available (e.g. from Dokploy/Render)
          // redis://:password@host:port
          try {
            const url = new URL(redisUrl);
            storeConfig = {
              host: url.hostname,
              port: parseInt(url.port || '6379'),
              password: url.password,
              username: url.username,
            };
          } catch (e) {
            console.error('Invalid REDIS_URL:', e);
          }
        } else {
          // Fallback to individual variables
          let redisHost = configService.get<string>('REDIS_HOST', 'localhost');
          let redisPort = configService.get<number>('REDIS_PORT', 6379);

          // Strip protocol if present (handle URLs like http://31.97.217.52:6379)
          if (redisHost.includes('://')) {
            try {
              const url = new URL(redisHost);
              redisHost = url.hostname;
              if (url.port) {
                redisPort = parseInt(url.port, 10);
              }
            } catch (error) {
              // If URL parsing fails, try to strip protocol manually
              redisHost = redisHost.replace(/^https?:\/\//, '');
              // Extract port if present
              const portMatch = redisHost.match(/:(\d+)$/);
              if (portMatch) {
                redisPort = parseInt(portMatch[1], 10);
                redisHost = redisHost.replace(/:(\d+)$/, '');
              }
            }
          }

          storeConfig = {
            host: redisHost,
            port: redisPort,
            password: configService.get<string>('REDIS_PASSWORD'),
          };
        }

        return {
          store: await redisStore({
            ...storeConfig,
            ttl: 60 * 1000, // Default TTL 1 minute
          }),
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
