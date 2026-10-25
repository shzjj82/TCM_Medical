import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 内部治疗资料库条目：由本院医案聚合沉淀而成（病症 + 证型 → 取穴/方剂规律 + 有效率）。
 * payload 保存 Skill 侧完整条目（含源医案编号），docs/ 目录下的 Markdown 是它的可读版本。
 */
@Entity('internal_protocols')
export class InternalProtocol {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  @Column()
  title!: string;

  @Column({ name: 'tcm_disease', nullable: true })
  tcmDisease?: string;

  @Column({ name: 'tcm_syndrome', nullable: true })
  tcmSyndrome?: string;

  @Column({ name: 'patient_count', type: 'int', default: 0 })
  patientCount!: number;

  @Column({ name: 'visit_count', type: 'int', default: 0 })
  visitCount!: number;

  @Column({ name: 'effective_rate', type: 'float', default: 0 })
  effectiveRate!: number;

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
