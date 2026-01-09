import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Tweet } from './tweet.entity';
import { MonitoredProfile } from './monitored-profile.entity';

/**
 * Junction table linking Tweets to MonitoredProfiles (many-to-many).
 * This allows a single tweet to be associated with multiple monitored profiles
 * when different tenants monitor the same Twitter user.
 */
@ObjectType()
@Entity('tweet_monitored_profiles')
@Unique(['tweetId', 'monitoredProfileId'])
export class TweetMonitoredProfile {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Field(() => String)
    @Column({ type: 'uuid' })
    tweetId: string;

    @Field(() => String)
    @Column({ type: 'uuid' })
    monitoredProfileId: string;

    @Field()
    @CreateDateColumn()
    linkedAt: Date;

    // --- RELATIONS ---

    @ManyToOne(() => Tweet, (tweet) => tweet.tweetMonitoredProfiles, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tweetId' })
    tweet: Tweet;

    @ManyToOne(
        () => MonitoredProfile,
        (profile) => profile.tweetMonitoredProfiles,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({ name: 'monitoredProfileId' })
    monitoredProfile: MonitoredProfile;
}
