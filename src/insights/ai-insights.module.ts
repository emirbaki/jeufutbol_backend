import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tweet } from '../entities/tweet.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Insight } from '../entities/insight.entity';
import { AIInsightsService } from './ai-insights.service';
import { AIInsightsResolver } from './ai-insights.resolver';
import { VectorDbService } from './vector-db.service';
import { LLMService } from './llm.service';
import { LlmCredential } from '../entities/llm-credential.entity';
import { AIInsightsSchedulerService } from './ai-insights-scheduler.service';
import { User } from '../entities/user.entity';
import { AIInsightsProcessor } from './processors/ai-insights.processor';
import { LLMController } from './llm.controller';
import { PostModule } from '../post/post.module';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { AiChatService } from './ai-chat.service';
import { AiChatResolver } from './ai-chat.resolver';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tweet,
      MonitoredProfile,
      Insight,
      LlmCredential,
      LlmCredential,
      User,
      ChatSession,
      ChatMessage,
    ]),
    PostModule,
    forwardRef(() => MonitoringModule),
  ],
  providers: [
    AIInsightsService,
    AIInsightsResolver,
    AIInsightsSchedulerService,
    AIInsightsProcessor,
    VectorDbService,
    LLMService,
    AiChatService,
    AiChatResolver,
  ],
  exports: [AIInsightsService, VectorDbService, LLMService],
  controllers: [LLMController],
})
export class AIInsightsModule { }
