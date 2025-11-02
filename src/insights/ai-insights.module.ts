import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Tweet } from '../entities/tweet.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Insight } from '../entities/insight.entity';
import { AIInsightsService } from './ai-insights.service';
import { AIInsightsResolver } from './ai-insights.resolver';
import { VectorDbService } from './vector-db.service';
import { LLMService } from './llm.service';
import { LlmCredential } from 'src/entities/llm-credential.entity';
import { AIInsightsSchedulerService } from './ai-insights-scheduler.service';
import { User } from 'src/entities/user.entity';
import { LLMController } from './llm.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tweet,
      MonitoredProfile,
      Insight,
      LlmCredential,
      User,
    ]),
    ConfigModule,
  ],
  controllers: [LLMController],
  providers: [
    AIInsightsService,
    AIInsightsResolver,
    AIInsightsSchedulerService,
    VectorDbService,
    LLMService,
  ],
  exports: [AIInsightsService, AIInsightsSchedulerService],
})
export class AIInsightsModule {}
