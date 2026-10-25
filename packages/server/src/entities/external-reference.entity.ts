import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 外部治疗参考资料库条目：经方、古籍、指南、论文病例、外部专家经验。
 * 由人工录入（`tcm.py ref add` 或管理后台），是治疗建议的「外源证据」。
 */
@Entity('external_references')
export class ExternalReference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  @Column()
  title!: string;

  @Column({ name: 'source_type', nullable: true })
  sourceType?: string;

  @Column({ nullable: true })
  source?: string;

  @Column({ nullable: true })
  citation?: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  indications!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  syndromes!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  acupoints!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  prescriptions!: string[];

  @Column({ name: 'treatment_principle', nullable: true })
  treatmentPrinciple?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ name: 'evidence_level', default: '未分级' })
  evidenceLevel!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
