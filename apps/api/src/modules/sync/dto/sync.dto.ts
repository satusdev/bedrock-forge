import { IsInt, IsPositive, IsIn } from 'class-validator';

export class SyncCloneDto {
	@IsInt() @IsPositive() sourceEnvironmentId!: number;
	@IsInt() @IsPositive() targetEnvironmentId!: number;
}

export class SyncPushDto {
	@IsInt() @IsPositive() environmentId!: number;
	@IsIn(['database', 'files', 'both']) scope!: string;
}
