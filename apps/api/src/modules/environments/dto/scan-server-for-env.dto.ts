import { IsInt, IsPositive } from 'class-validator';

export class ScanServerForEnvDto {
	/** ID of the server to scan for WordPress installations */
	@IsInt() @IsPositive() server_id!: number;
}
