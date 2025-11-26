import { Injectable, Scope } from '@nestjs/common';
import { TenancyStore } from './tenancy.store';
import { Tenant } from '../entities/tenant.entity';

@Injectable({ scope: Scope.REQUEST })
export class TenancyService {
    get tenant(): Tenant | undefined {
        return TenancyStore.getTenant();
    }
}
