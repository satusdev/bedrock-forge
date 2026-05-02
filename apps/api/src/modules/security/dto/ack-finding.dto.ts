import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class AckFindingDto {
	@IsString()
	@MaxLength(64)
	@Matches(/^(server|environment):\d+$/, {
		message: 'scope_key must be "server:<id>" or "environment:<id>"',
	})
	scope_key!: string;

	@IsString()
	@MaxLength(64)
	category!: string;

	@IsString()
	@MaxLength(256)
	title!: string;

	@IsOptional()
	@IsString()
	@MaxLength(1000)
	note?: string | null;
}

export class RemoveAckDto {
	@IsString()
	@MaxLength(64)
	@Matches(/^(server|environment):\d+$/, {
		message: 'scope_key must be "server:<id>" or "environment:<id>"',
	})
	scope_key!: string;

	@IsString()
	@MaxLength(64)
	category!: string;

	@IsString()
	@MaxLength(256)
	title!: string;
}
