import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const BACKUP_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export const BACKUP_TYPES_SCHEDULE = ['full', 'db_only', 'files_only'] as const;
export type BackupTypeSchedule = (typeof BACKUP_TYPES_SCHEDULE)[number];

export class UpsertBackupScheduleDto {
	@IsIn(BACKUP_TYPES_SCHEDULE)
	type: BackupTypeSchedule = 'full';

	@IsIn(BACKUP_FREQUENCIES)
	frequency: BackupFrequency = 'daily';

	/** Hour of day in UTC (0–23) */
	@IsInt()
	@Min(0)
	@Max(23)
	hour: number = 3;

	/** Minute of hour (0–59) */
	@IsInt()
	@Min(0)
	@Max(59)
	minute: number = 0;

	/** Day of week for 'weekly' (0 = Sunday … 6 = Saturday) */
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(6)
	day_of_week?: number;

	/** Day of month for 'monthly' (1–28) */
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(28)
	day_of_month?: number;

	@IsBoolean()
	enabled: boolean = true;

	/** Keep last N completed scheduled backups — null / omit means unlimited */
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(1000)
	retention_count?: number | null;

	/** Auto-delete scheduled backups older than N days — null / omit means never */
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(365)
	retention_days?: number | null;
}
