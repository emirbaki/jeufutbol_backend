import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Tenant } from './tenant.entity';

/** One branch of a tenant (for example Football or Cinema). Holds social accounts and posts. */
@ObjectType()
@Entity('workspaces')
@Index('UQ_workspaces_tenant_slug', ['tenantId', 'slug'], { unique: true })
@Index('UQ_workspaces_tenant_default', ['tenantId'], { unique: true, where: '"isDefault" = true' })
export class Workspace {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Field()
  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 40 })
  slug: string;

  @Field()
  @Column({ default: false })
  isDefault: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
