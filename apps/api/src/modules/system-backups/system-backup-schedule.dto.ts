import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const SYSTEM_BACKUP_FREQUENCIES = [
	'hourly',
	'daily',
	'weekly',
	'monthly',
] as const;
export type SystemBackupFrequency = (typeof SYSTEM_BACKUP_FREQUENCIES)[number];

export class UpsertSystemBackupScheduleDto {
	@IsIn(SYSTEM_BACKUP_FREQUENCIES)
	frequency: SystemBackupFrequency = 'daily';

	/** Hour of day in UTC (0–23). Ignored for hourly. */
	@IsInt()
	@Min(0)
	@Max(23)
	hour: number = 3;

	/** Minute of hour (0–59). */
	@IsInt()
	@Min(0)
	@Max(59)
	minute: number = 0;

	/** Day of week for 'weekly' (0 = Sunday … 6 = Saturday). */
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(6)
	day_of_week?: number;

	/** Day of month for 'monthly' (1–28). */
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(28)
	day_of_month?: number;

	@IsBoolean()
	enabled: boolean = true;

	/** Keep last N completed system backups — null / omit means unlimited. */
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	retention_count?: number | null;

	/** Auto-delete system backups older than N days — null / omit means never. */
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(365)
	retention_days?: number | null;
}
