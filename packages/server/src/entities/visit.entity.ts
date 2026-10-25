import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
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

  /**
   * 外键列。必须显式声明：QueryBuilder 是按「实体属性」解析的，
   * 只写 @ManyToOne 而不声明 patientId，会导致 `v.patientId = :pid` 找不到属性而抛错
   * （病人详情接口正是因此一直 500）。
   * 列名沿用 TypeORM 默认生成的 patientId，与现有库表一致，不会触发改表。
   */
  @Column({ type: 'uuid', nullable: true })
  patientId?: string;

  @ManyToOne(() => Patient, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'patientId' })
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
