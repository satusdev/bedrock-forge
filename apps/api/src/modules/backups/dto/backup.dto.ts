import { IsIn, IsOptional, IsInt, IsPositive, IsString } from 'class-validator';

export class EnqueueBackupDto {
	@IsInt() @IsPositive() environmentId!: number;
	@IsIn(['full', 'db_only', 'files_only']) type!: string;
	@IsOptional() @IsString() label?: string;
}

export class RestoreBackupDto {
	@IsInt() @IsPositive() backupId!: number;
}
