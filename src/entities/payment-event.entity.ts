import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

export enum PaymentEventStatus {
    PROCESSED = 'processed',
    FAILED = 'failed',
}

@ObjectType()
@Entity('payment_events')
export class PaymentEvent {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Field()
    @Column({ name: 'event_type' })
    eventType: string;

    @Field()
    @Index({ unique: true })
    @Column({ name: 'lemon_squeezy_event_id' })
    lemonSqueezyEventId: string;

    @Field(() => String, { nullable: true })
    @Column({ name: 'subscription_id', type: 'varchar', nullable: true })
    subscriptionId: string | null;

    @Column({ type: 'jsonb' })
    payload: Record<string, any>;

    @Field()
    @Column({
        type: 'enum',
        enum: PaymentEventStatus,
        default: PaymentEventStatus.PROCESSED,
    })
    status: PaymentEventStatus;

    @Field(() => String, { nullable: true })
    @Column({ name: 'error_message', type: 'text', nullable: true })
    errorMessage: string | null;

    @Field(() => Date)
    @CreateDateColumn({ name: 'processed_at' })
    processedAt: Date;
}
