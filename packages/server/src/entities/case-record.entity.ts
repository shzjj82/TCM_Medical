import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Patient } from './patient.entity';

/**
 * 就诊档案（疾病信息）：一个病患可有多份档案（按疾病/疗程分开）。
 * 纯中医字段：主诉、现病史、中医病名、证型、舌脉、就诊方案，无西医诊断。
 * 归档后 status = archived，archive_snapshot 固化「病患信息 + 诊疗全过程」，
 * 同时写入内部知识库（internal_protocols）。
 */
@Entity('case_records')
export class CaseRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  /** 必须显式声明 uuid 列，否则 QueryBuilder 无法直接按 caseId 过滤（同 visit.patientId 的坑）。 */
  @Column({ type: 'uuid', nullable: true })
  patientId?: string;

  @ManyToOne(() => Patient, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient?: Patient;

  /** 该病患的第几份档案（从 1 开始）。 */
  @Column({ name: 'case_no', type: 'int', default: 1 })
  caseNo!: number;

  @Column({ name: 'chief_complaint', type: 'text' })
  chiefComplaint!: string;

  @Column({ name: 'present_illness', type: 'text', nullable: true })
  presentIllness?: string;

  @Column({ name: 'tcm_disease', nullable: true })
  tcmDisease?: string;

  @Column({ name: 'tcm_syndrome', nullable: true })
  tcmSyndrome?: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  symptoms!: string[];

  @Column({ nullable: true })
  tongue?: string;

  @Column({ nullable: true })
  pulse?: string;

  /** 初诊严重度 0~10，疗效对比锚点。 */
  @Column({ name: 'severity_score', type: 'int', nullable: true })
  severityScore?: number;

  /** 就诊方案：{ principle, acupoints[], prescriptions[], lifestyle[] }。 */
  @Column({ name: 'treatment_plan', type: 'jsonb', nullable: true })
  treatmentPlan?: Record<string, unknown>;

  @Column({ default: 'active' })
  status!: 'active' | 'archived';

  @Column({ name: 'visit_count', type: 'int', default: 0 })
  visitCount!: number;

  /** 期初 → N 次治疗 → 末期 对比（多次治疗结果数据），由后端统一计算。 */
  @Column({ type: 'jsonb', nullable: true })
  contrast?: Record<string, unknown>;

  @Column({ name: 'latest_summary', type: 'text', nullable: true })
  latestSummary?: string;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt?: Date;

  /** 归档快照：病患信息摘要 + 档案全文 + 全部治疗记录概要。 */
  @Column({ name: 'archive_snapshot', type: 'jsonb', nullable: true })
  archiveSnapshot?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
