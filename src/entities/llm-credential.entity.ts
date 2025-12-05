import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('llm_credentials')
export class LlmCredential {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ nullable: true })
  name: string;

  @Column()
  provider: string;

  @Column()
  apiKey: string;

  @Column({ nullable: true })
  baseUrl?: string;

  @Column({ nullable: true })
  modelName?: string;

  @Column({ type: 'float', default: 0.7 })
  temperature: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;
}
