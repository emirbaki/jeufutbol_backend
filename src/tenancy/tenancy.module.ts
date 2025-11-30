import {
  Module,
  MiddlewareConsumer,
  RequestMethod,
  Global,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../entities/tenant.entity';
import { TenancyService } from './tenancy.service';
import { TenancyStore } from './tenancy.store';
import { TenancyMiddleware } from './tenancy.middleware';
import { TenantResolver } from './tenant.resolver';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenancyService, TenancyStore, TenantResolver],
  exports: [TenancyService, TenancyStore],
})
export class TenancyModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenancyMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
