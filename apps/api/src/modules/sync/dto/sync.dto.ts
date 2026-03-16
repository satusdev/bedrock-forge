import { IsInt, IsPositive, IsIn, IsOptional, IsString } from 'class-validator';

export class SyncCloneDto {
	@IsInt() @IsPositive() sourceEnvironmentId!: number;
	@IsInt() @IsPositive() targetEnvironmentId!: number;
	@IsOptional() @IsString() searchReplace?: string;
}

export class SyncPushDto {
	@IsInt() @IsPositive() environmentId!: number;
	@IsIn(['database', 'files', 'both']) scope!: string;
}
