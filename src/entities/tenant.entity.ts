import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { User } from './user.entity';
import { Subscription } from './subscription.entity';

@ObjectType()
@Entity('app_tenants')
export class Tenant {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  name: string;

  @Field()
  @Column({ unique: true })
  subdomain: string;

  @Field({ nullable: true })
  @Column({ unique: true, nullable: true })
  clientId: string;

  @Column({ nullable: true })
  clientSecretHash: string;

  @Field(() => [User], { nullable: true })
  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @Field(() => Subscription, { nullable: true })
  @OneToOne(() => Subscription, (subscription) => subscription.tenant)
  subscription: Subscription;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}

