import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class ThemeManageDto {
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Matches(/^[a-z0-9_-]+$/, {
		message:
			'Slug must contain only lowercase letters, numbers, hyphens, and underscores',
	})
	slug?: string;
}
