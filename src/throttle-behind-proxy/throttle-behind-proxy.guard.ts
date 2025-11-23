import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return (
      req.headers['cf-connecting-ip'] ??
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
      req.ip ??
      req.connection?.remoteAddress ??
      'unknown'
    );
  }
}

