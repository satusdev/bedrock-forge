import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const billingStatusValues = ['active', 'inactive', 'trial', 'overdue'] as const;

export class GetClientsQueryDto {
	@IsOptional()
	@IsString()
	search?: string;

	@IsOptional()
	@IsIn(billingStatusValues)
	status?: (typeof billingStatusValues)[number];

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	limit?: number = 50;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset?: number = 0;
}
