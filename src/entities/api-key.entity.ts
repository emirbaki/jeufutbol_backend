import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@ObjectType()
@Entity('api_keys')
export class ApiKey {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Field()
    @Column()
    name: string;

    // Hashed API key - never exposed via GraphQL
    @Column({ unique: true })
    key: string;

    @Field()
    @Column()
    keyPrefix: string;

    @Column()
    tenantId: string;

    @Field(() => Tenant)
    @ManyToOne(() => Tenant)
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant;

    @Column({ nullable: true })
    createdByUserId: string;

    @Field(() => User, { nullable: true })
    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'createdByUserId' })
    createdBy: User;

    @Field(() => [String])
    @Column('text', { array: true, default: '{}' })
    scopes: string[];

    @Field()
    @Column({ default: true })
    isActive: boolean;

    @Field({ nullable: true })
    @Column({ type: 'timestamptz', nullable: true })
    lastUsedAt: Date;

    @Field({ nullable: true })
    @Column({ type: 'timestamptz', nullable: true })
    expiresAt: Date;

    @Field(() => String, { nullable: true })
    @Column({ type: 'jsonb', default: '{}' })
    metadata: Record<string, any>;

    @Field()
    @CreateDateColumn()
    createdAt: Date;

    @Field()
    @UpdateDateColumn()
    updatedAt: Date;
}
