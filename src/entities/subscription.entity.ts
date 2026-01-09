import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Tenant } from './tenant.entity';
import {
    SubscriptionStatus,
    SubscriptionPlan,
    BillingCycle,
} from '../subscription/enums/subscription.enum';

@ObjectType('BillingSubscription')
@Entity('subscriptions')
export class Subscription {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'tenant_id' })
    tenantId: string;

    @Field(() => Tenant)
    @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant;

    @Field(() => String, { nullable: true })
    @Column({ name: 'lemon_squeezy_subscription_id', type: 'varchar', nullable: true })
    lemonSqueezySubscriptionId: string | null;

    @Field(() => String, { nullable: true })
    @Column({ name: 'lemon_squeezy_customer_id', type: 'varchar', nullable: true })
    lemonSqueezyCustomerId: string | null;

    @Field()
    @Column({
        type: 'enum',
        enum: SubscriptionStatus,
        default: SubscriptionStatus.ACTIVE,
    })
    status: SubscriptionStatus;

    @Field()
    @Column({
        type: 'enum',
        enum: SubscriptionPlan,
        default: SubscriptionPlan.FREE,
    })
    plan: SubscriptionPlan;

    @Field()
    @Column({
        type: 'enum',
        enum: BillingCycle,
        default: BillingCycle.MONTHLY,
        name: 'billing_cycle',
    })
    billingCycle: BillingCycle;

    @Field(() => Date, { nullable: true })
    @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
    currentPeriodStart: Date | null;

    @Field(() => Date, { nullable: true })
    @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
    currentPeriodEnd: Date | null;

    @Field()
    @Column({ name: 'cancel_at_period_end', default: false })
    cancelAtPeriodEnd: boolean;

    @Field()
    @Column({ name: 'is_grandfathered', default: false })
    isGrandfathered: boolean;

    @Field(() => Date, { nullable: true })
    @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
    trialEndsAt: Date | null;

    @Field(() => Date)
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Field(() => Date)
    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
