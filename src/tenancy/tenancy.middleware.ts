import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { TenancyStore } from './tenancy.store';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenancyMiddleware.name);
  private readonly baseDomain: string | null;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly configService: ConfigService,
  ) {
    // Get base domain from environment (e.g., 'jeufutbol.com.tr')
    this.baseDomain = this.configService.get<string>('BASE_DOMAIN') || null;
    if (this.baseDomain) {
      this.logger.log(`Tenancy middleware configured with base domain: ${this.baseDomain}`);
    }
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const host = req.headers.host;
    const headerSubdomain = req.headers['x-tenant-subdomain'] as string;

    // Priority: Header > Host
    const hostname = host?.split(':')[0];
    let subdomain: string | null = null;

    if (headerSubdomain) {
      subdomain = headerSubdomain;
    } else if (hostname) {
      subdomain = this.extractSubdomain(hostname);
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
        this.logger.debug(`Tenant context set: ${tenant.subdomain} (${tenant.name})`);
      } else {
        // Don't throw error - proceed without tenant context
        // The endpoint will use tenantId from JWT token instead
        this.logger.debug(`Subdomain '${subdomain}' detected but no tenant found, proceeding without tenant context`);
      }
    }

    next();
  }

  /**
   * Extract subdomain from hostname, accounting for base domain
   */
  private extractSubdomain(hostname: string): string | null {
    // Handle localhost
    if (hostname.endsWith('localhost')) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        return parts[0]; // e.g., 'tenant.localhost' -> 'tenant'
      }
      return null;
    }

    // If base domain is configured, extract subdomain relative to it
    if (this.baseDomain) {
      // e.g., hostname='tenant.jeufutbol.com.tr', baseDomain='jeufutbol.com.tr'
      if (hostname === this.baseDomain) {
        return null; // This IS the base domain, no subdomain
      }

      if (hostname.endsWith(`.${this.baseDomain}`)) {
        // Extract everything before the base domain
        const subdomainPart = hostname.slice(0, -(this.baseDomain.length + 1));
        // If there are multiple levels, take only the first one
        // e.g., 'a.b.jeufutbol.com.tr' -> 'a'
        return subdomainPart.split('.')[0];
      }

      return null; // Different domain entirely
    }

    // Fallback: simple splitting (works for simple TLDs like .com, .org)
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      return parts[0];
    }

    return null;
  }
}
