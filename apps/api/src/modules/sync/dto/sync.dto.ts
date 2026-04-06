import {
	IsInt,
	IsPositive,
	IsIn,
	IsOptional,
	IsBoolean,
} from 'class-validator';

export class SyncCloneDto {
	@IsInt() @IsPositive() sourceEnvironmentId!: number;
	@IsInt() @IsPositive() targetEnvironmentId!: number;
	@IsOptional() @IsBoolean() skipSafetyBackup?: boolean;
}

export class SyncPushDto {
	@IsInt() @IsPositive() sourceEnvironmentId!: number;
	@IsInt() @IsPositive() targetEnvironmentId!: number;
	@IsIn(['database', 'files', 'both']) scope!: string;
	@IsOptional() @IsBoolean() skipSafetyBackup?: boolean;
}
