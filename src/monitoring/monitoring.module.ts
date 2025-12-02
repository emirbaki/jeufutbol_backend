import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { MonitoringService } from './monitoring.service';
import { MonitoringResolver } from './monitoring.resolver';
import { MonitoringSchedulerService } from './monitoring-scheduler.service';
import { TweetsModule } from '../tweets/tweets.module';
import { AIInsightsModule } from '../insights/ai-insights.module';
import { MonitoringProcessor } from './monitoring.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitoredProfile]),
    TweetsModule,
    forwardRef(() => AIInsightsModule),
    ScheduleModule.forRoot(),
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
