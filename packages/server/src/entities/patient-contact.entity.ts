import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * 患者紧急联系人。和患者本人分开存。
 * 一位患者可以有多条，每条有各自的关系。
 */
@Entity('patient_contacts')
@Index(['patientId'])
export class PatientContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  patientId!: string;

  @Column({ default: 'emergency' })
  role!: string;

  @Column({ type: 'varchar', nullable: true })
  name?: string | null;

  /** 与患者的关系，见 CONTACT_RELATIONS。 */
  @Column({ type: 'varchar', nullable: true })
  relation?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
