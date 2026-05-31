import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
  STAFF = 'staff',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role!: UserRole;

  @Column({ nullable: true })
  stellarPublicKey?: string;

  // OTP fields for verification and password reset
  @Column({ nullable: true })
  otp?: string;

  @Column({ type: 'timestamp', nullable: true })
  otpExpiry?: Date;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  profilePicture?: string;

  // TOTP (Time-based One-Time Password) fields for 2FA
  @Column({ default: false })
  totpEnabled: boolean;

  @Column({ nullable: true })
  totpSecret?: string;

  @Column({ type: 'simple-array', nullable: true })
  backupCodes?: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
