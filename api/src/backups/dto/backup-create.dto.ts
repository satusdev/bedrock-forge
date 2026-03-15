import {
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

const backupTypes = ['full', 'database', 'files'] as const;
const storageTypes = ['local', 'google_drive', 's3'] as const;

export class BackupCreateDto {
	@IsInt()
	@Min(1)
	project_id!: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	environment_id?: number;

	@IsOptional()
	@IsString()
	@IsIn(backupTypes)
	backup_type?: (typeof backupTypes)[number] = 'full';

	@IsOptional()
	@IsString()
	@IsIn(storageTypes)
	storage_type?: (typeof storageTypes)[number] = 'local';

	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsString()
	notes?: string;
}
