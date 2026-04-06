import { IsString, MaxLength, Matches } from 'class-validator';

export class ChangeConstraintDto {
	@IsString()
	@MaxLength(50)
	@Matches(/^[\w.^~*|@, ><=!-]+$/, {
		message:
			'Invalid version constraint — use characters like ^, ~, *, >, <, =, digits, dots, hyphens',
	})
	constraint!: string;
}
