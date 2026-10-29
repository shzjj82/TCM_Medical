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

  /** 性别字典：男、女。缺省男。 */
  @Column({ type: 'varchar', length: 8, nullable: true, default: '男' })
  gender?: string | null;

  /** 由出生日期计算，不单独手填。没有出生日期时为空。 */
  @Column({ type: 'int', nullable: true })
  age?: number | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate?: string | null;

  @Column({ nullable: true })
  phone?: string;

  /**
   * 身份证号密文（AES-256-GCM）。可选。
   * select: false，列表和详情都不会带出；明文不落库。
   */
  @Column({ name: 'id_card_cipher', type: 'text', nullable: true, select: false })
  idCardCipher?: string | null;

  /** 展示用掩码，例如 110***********1234。不能反推明文。 */
  @Column({ name: 'id_card_mask', type: 'varchar', nullable: true })
  idCardMask?: string | null;

  @Column({ type: 'varchar', nullable: true })
  occupation?: string | null;

  @Column({ type: 'text', nullable: true })
  residence?: string | null;

  /** 患者来源：自然到诊、亲友介绍、医生转诊、线上咨询、其他。 */
  @Column({ type: 'varchar', nullable: true })
  source?: string | null;

  /** 主治医生。旧数据为空，列表展示为「—」，不编造。 */
  @Column({ nullable: true })
  doctor?: string;

  /** 隐私授权：granted 授权，revoked 未授权。旧数据 unknown 在表单中也按未授权显示。 */
  @Column({ name: 'privacy_consent', default: 'revoked' })
  privacyConsent!: 'unknown' | 'granted' | 'revoked';

  @Column({ name: 'privacy_consent_at', type: 'timestamptz', nullable: true })
  privacyConsentAt?: Date | null;

  /** AI 使用授权，取值同隐私授权。默认未授权。 */
  @Column({ name: 'ai_consent', default: 'revoked' })
  aiConsent!: 'unknown' | 'granted' | 'revoked';

  @Column({ name: 'ai_consent_at', type: 'timestamptz', nullable: true })
  aiConsentAt?: Date | null;

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
