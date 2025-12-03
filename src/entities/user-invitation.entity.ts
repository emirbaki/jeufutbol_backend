import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { UserRole } from '../auth/user-role.enum';

export enum InvitationStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    REVOKED = 'REVOKED',
    EXPIRED = 'EXPIRED',
}

registerEnumType(InvitationStatus, {
    name: 'InvitationStatus',
});

@ObjectType()
@Entity('user_invitations')
export class UserInvitation {
    @Field(() => ID)
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Field()
    @Column()
    email: string;

    @Column()
    tenantId: string;

    @Field(() => Tenant)
    @ManyToOne(() => Tenant)
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant;

    @Column()
    invitedByUserId: string;

    @Field(() => User)
    @ManyToOne(() => User)
    @JoinColumn({ name: 'invitedByUserId' })
    invitedBy: User;

    @Field(() => UserRole)
    @Column({
        type: 'enum',
        enum: UserRole,
    })
    role: UserRole;

    @Field()
    @Column({ unique: true })
    token: string;

    @Field(() => InvitationStatus)
    @Column({
        type: 'enum',
        enum: InvitationStatus,
        default: InvitationStatus.PENDING,
    })
    status: InvitationStatus;

    @Field()
    @Column({ type: 'timestamptz' })
    expiresAt: Date;

    @Field()
    @CreateDateColumn()
    createdAt: Date;

    @Field()
    @UpdateDateColumn()
    updatedAt: Date;
}
