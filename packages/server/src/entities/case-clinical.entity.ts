import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CaseRecord } from './case-record.entity';

/**
 * 病史。界面上归在主诉里，单独成表：既往史、家族史、过敏史、用药史、手术史。
 * 一份档案最多一行。
 */
@Entity('case_histories')
export class CaseHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  caseId!: string;

  @ManyToOne(() => CaseRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caseId' })
  caseRecord?: CaseRecord;

  @Column({ name: 'past_history', type: 'text', nullable: true })
  pastHistory?: string | null;

  @Column({ name: 'family_history', type: 'text', nullable: true })
  familyHistory?: string | null;

  @Column({ name: 'allergy_history', type: 'text', nullable: true })
  allergyHistory?: string | null;

  @Column({ name: 'medication_history', type: 'text', nullable: true })
  medicationHistory?: string | null;

  @Column({ name: 'surgery_history', type: 'text', nullable: true })
  surgeryHistory?: string | null;
}

/** 中西医诊断。一份档案一行：西医诊断、中医病名、证型。 */
@Entity('case_diagnoses')
export class CaseDiagnosis {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  caseId!: string;

  @ManyToOne(() => CaseRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caseId' })
  caseRecord?: CaseRecord;

  @Column({ name: 'western_diagnosis', type: 'text', nullable: true })
  westernDiagnosis?: string | null;

  @Column({ name: 'tcm_disease', type: 'varchar', nullable: true })
  tcmDisease?: string | null;

  @Column({ name: 'tcm_syndrome', type: 'varchar', nullable: true })
  tcmSyndrome?: string | null;
}

/** 检验、检查资料。一份档案可以有多条。 */
@Entity('case_exams')
export class CaseExam {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  caseId!: string;

  @ManyToOne(() => CaseRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caseId' })
  caseRecord?: CaseRecord;

  /** 检验 或 检查。 */
  @Column({ type: 'varchar' })
  kind!: '检验' | '检查';

  @Column({ type: 'varchar', nullable: true })
  title?: string | null;

  @Column({ type: 'text', nullable: true })
  result?: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
