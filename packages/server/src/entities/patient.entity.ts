import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 病人 SCRM 档案。
 *
 * 与 Skill 本地 JSON 契约一一对应（见 skills/tcm-medical-case/SKILL.md §5）：
 * initialCondition 是疗效对比的基线，`contrast` 是前端「期初→X 次治疗→末期」区块的数据源。
 * externalId 保存 Skill 侧 PID，用于幂等同步。
 */
@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  gender?: string;

  @Column({ type: 'int', nullable: true })
  age?: number;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags!: string[];

  @Column({ default: 'active' })
  status!: 'active' | 'paused' | 'closed';

  @Column({ name: 'visit_count', type: 'int', default: 0 })
  visitCount!: number;

  @Column({ name: 'initial_condition', type: 'jsonb', nullable: true })
  initialCondition?: Record<string, unknown>;

  @Column({ name: 'current_condition', type: 'jsonb', nullable: true })
  currentCondition?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  contrast?: {
    initial?: Record<string, unknown>;
    visitsDone?: number;
    treatments?: string[];
    latest?: Record<string, unknown>;
    delta?: Record<string, unknown>;
    milestones?: Array<Record<string, unknown>>;
  };

  @Column({ name: 'latest_summary', type: 'text', nullable: true })
  latestSummary?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
