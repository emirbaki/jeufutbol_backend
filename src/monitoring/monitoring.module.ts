import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { MonitoringService } from './monitoring.service';
import { MonitoringResolver } from './monitoring.resolver';
import { MonitoringSchedulerService } from './monitoring-scheduler.service';
import { TweetsModule } from '../tweets/tweets.module';
import { AIInsightsModule } from '../insights/ai-insights.module';
import { MonitoringProcessor } from './monitoring.processor';
import { AuthModule } from '../auth/auth.module';
import { Tenant } from '../entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitoredProfile, User, ApiKey, Tenant]),
    TweetsModule,
    forwardRef(() => AIInsightsModule),
    ScheduleModule.forRoot(),
    AuthModule,
  ],
  providers: [
    MonitoringService,
    MonitoringResolver,
    MonitoringSchedulerService,
    MonitoringProcessor,
  ],
  exports: [MonitoringService],
})
export class MonitoringModule { }
