import { AsyncLocalStorage } from 'async_hooks';
import { Tenant } from '../entities/tenant.entity';

export class TenancyStore {
    private static readonly storage = new AsyncLocalStorage<Tenant>();

    static enterWith(tenant: Tenant) {
        this.storage.enterWith(tenant);
    }

    static run<T>(tenant: Tenant, callback: () => T): T {
        return this.storage.run(tenant, callback);
    }

    static getTenant(): Tenant | undefined {
        return this.storage.getStore();
    }
}
