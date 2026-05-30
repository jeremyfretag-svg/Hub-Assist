import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, DeleteDateColumn } from 'typeorm';

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

  // ── OTP flood-protection fields ──────────────────────────────────────────

  /**
   * Number of consecutive wrong OTP guesses since the last OTP was issued.
   * Reset to 0 when a new OTP is generated.
   */
  @Column({ default: 0 })
  otpAttempts!: number;

  /**
   * Set when the OTP is invalidated after MAX_OTP_ATTEMPTS wrong guesses.
   * A non-null value means the current OTP is no longer usable.
   */
  @Column({ type: 'timestamp', nullable: true })
  otpInvalidatedAt?: Date;

  /**
   * Total number of OTP resend requests made by this user.
   * Used as a DB-level fallback counter when Redis is unavailable.
   */
  @Column({ default: 0 })
  otpResendCount!: number;

  // ── End OTP flood-protection fields ──────────────────────────────────────

   @Column({ default: false })
   isVerified: boolean;

   @Column({ default: true })
   isActive: boolean;

   @Column({ nullable: true })
   profilePicture?: string;

   @CreateDateColumn()
   createdAt!: Date;

   @DeleteDateColumn({ nullable: true })
   deletedAt?: Date;
}
