import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CaseRecord } from './case-record.entity';
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

  /** 治疗记录归属的就诊档案（疾病信息）；老数据可能为空。 */
  @Column({ type: 'uuid', nullable: true })
  caseId?: string;

  @ManyToOne(() => CaseRecord, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'caseId' })
  caseRecord?: CaseRecord;

  /** Skill 同步路径使用的档案外部 ID。 */
  @Column({ name: 'external_case_id', nullable: true })
  externalCaseId?: string;

  @Column({ name: 'visit_no', type: 'int' })
  visitNo!: number;

  /** 初诊 first、复诊 return、结案 close、转诊 refer、随访 follow。旧数据为空时按就诊序号推断。 */
  @Column({ type: 'varchar', length: 16, nullable: true })
  kind?: 'first' | 'return' | 'close' | 'refer' | 'follow' | null;

  /** 本次主诉。复诊另存一条，不覆盖初诊。 */
  @Column({ name: 'chief_complaint', type: 'text', nullable: true })
  chiefComplaint?: string | null;

  /** 本次现病史。复诊另存一条，不覆盖初诊。 */
  @Column({ name: 'present_illness', type: 'text', nullable: true })
  presentIllness?: string | null;

  /** 本次诊断和方案。复诊另存一条，不覆盖初诊。 */
  @Column({ type: 'jsonb', nullable: true })
  diagnosis?: Record<string, unknown> | null;

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
