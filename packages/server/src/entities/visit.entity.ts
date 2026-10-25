import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from './patient.entity';

/**
 * 一次门诊/治疗记录（复诊跟进）。
 *
 * raw 保存语音转写、图片 OCR 与原始文本，parsed 保存 AI/规则抽取后的结构化医案，
 * 二者分离保证任何时候都能基于原始素材重新解析。
 */
@Entity('visits')
export class Visit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  @Column({ name: 'external_patient_id', nullable: true })
  externalPatientId?: string;

  @ManyToOne(() => Patient, { nullable: true, onDelete: 'SET NULL' })
  patient?: Patient;

  @Column({ name: 'visit_no', type: 'int' })
  visitNo!: number;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  channels!: string[];

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, unknown>;

  @Column({ name: 'doctor_note', type: 'text', nullable: true })
  doctorNote?: string;

  @Column({ type: 'jsonb', nullable: true })
  parsed?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  outcome?: Record<string, unknown>;

  @Column({ name: 'ai_mode', default: 'unknown' })
  aiMode!: string;

  @Column({ name: 'review_status', default: 'pending' })
  reviewStatus!: 'pending' | 'confirmed' | 'rejected';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
