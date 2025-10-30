import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { MonitoringService } from './monitoring.service';
import { MonitoringResolver } from './monitoring.resolver';
import { MonitoringSchedulerService } from './monitoring-scheduler.service';
import { TweetsModule } from '../tweets/tweets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitoredProfile]),
    TweetsModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    MonitoringService,
    MonitoringResolver,
    MonitoringSchedulerService,
  ],
  exports: [MonitoringService],
})
export class MonitoringModule {}
