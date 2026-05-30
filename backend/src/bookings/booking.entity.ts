import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity';
import { User } from '../users/user.entity';

export enum BookingStatus {
  PENDING = 'Pending',
  CONFIRMED = 'Confirmed',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed',
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  workspaceId!: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspaceId' })
  workspace!: Workspace;

  @Column()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'timestamp' })
  startTime!: Date;

  @Column({ type: 'timestamp' })
  endTime!: Date;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status!: BookingStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({ nullable: true, default: null })
  stellarTxHash!: string;

  @Column({ nullable: true })
  hubId?: string;

  // ── Recurring booking fields ──────────────────────────────────────────────

  /**
   * RFC 5545 RRULE string (e.g. "FREQ=WEEKLY;COUNT=4").
   * Only set on the first instance of a series; null for one-off bookings.
   */
  @Column({ nullable: true, type: 'text' })
  recurrenceRule?: string;

  /**
   * UUID shared by all instances of the same recurring series.
   * Null for one-off bookings.
   */
  @Column({ nullable: true, type: 'uuid' })
  seriesId?: string;

  /**
   * 0-based position of this instance within its series.
   * Null for one-off bookings.
   */
  @Column({ nullable: true, type: 'int' })
  instanceIndex?: number;

  // ── Cancellation policy fields ────────────────────────────────────────────

  /**
   * Amount refunded when the booking was cancelled.
   * Null until the booking is cancelled.
   */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  refundAmount?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
