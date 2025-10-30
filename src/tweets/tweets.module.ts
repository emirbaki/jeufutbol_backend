import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tweet } from '../entities/tweet.entity';
import { TweetsService } from './tweets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tweet])],
  providers: [TweetsService],
  exports: [TweetsService],
})
export class TweetsModule {}
