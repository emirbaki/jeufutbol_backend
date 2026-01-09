import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tweet } from '../entities/tweet.entity';
import { TweetMonitoredProfile } from '../entities/tweet-monitored-profile.entity';
import { TweetsService } from './tweets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tweet, TweetMonitoredProfile])],
  providers: [TweetsService],
  exports: [TweetsService],
})
export class TweetsModule { }
