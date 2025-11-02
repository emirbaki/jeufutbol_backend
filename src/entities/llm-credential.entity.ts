import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('llm_credentials')
export class LlmCredential {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', unique: true })
  userId: string;

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
}
