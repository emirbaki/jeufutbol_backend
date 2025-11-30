import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { TenancyStore } from './tenancy.store';

@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = req.headers.host;
    const headerSubdomain = req.headers['x-tenant-subdomain'] as string;

    // Priority: Header > Host
    const hostname = host?.split(':')[0];
    let subdomain: string | null = null;

    if (headerSubdomain) {
      subdomain = headerSubdomain;
    } else if (hostname) {
      const parts = hostname.split('.');
      if (hostname.endsWith('localhost')) {
        if (parts.length >= 2) {
          subdomain = parts[0];
        }
      } else {
        // Production logic (e.g. app.com)
        if (parts.length >= 3) {
          subdomain = parts[0];
        }
      }
    }

    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      const tenant = await this.tenantRepository.findOne({
        where: { subdomain },
      });

      if (tenant) {
        // Store tenant in AsyncLocalStorage
        TenancyStore.enterWith(tenant);
        // Also attach to request object for easier access in guards/interceptors if needed
        (req as any).tenant = tenant;
      } else {
        // If subdomain exists but tenant not found -> 404?
        // Or just proceed as public?
        // Let's throw 404 for now if it looks like a tenant subdomain
        throw new NotFoundException(`Tenant '${subdomain}' not found`);
      }
    }

    next();
  }
}
