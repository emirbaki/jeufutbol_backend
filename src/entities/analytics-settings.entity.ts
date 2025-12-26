import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { Tenant } from './tenant.entity';

@ObjectType()
@Entity('analytics_settings')
export class AnalyticsSettings {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Field()
    @Column({ type: 'uuid' })
    @Index({ unique: true })
    tenantId: string;

    @Field(() => Int)
    @Column({ type: 'int', default: 6 })
    refreshIntervalHours: number;

    @Field({ nullable: true })
    @Column({ type: 'timestamptz', nullable: true })
    lastRefreshAt?: Date;

    @Field()
    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant;
}
