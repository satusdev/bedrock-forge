import { IsArray, IsEnum, ArrayMinSize } from 'class-validator';
import {
	SERVER_SCAN_TYPES,
	ENVIRONMENT_SCAN_TYPES,
} from '@bedrock-forge/shared';
import type { SecurityScanType } from '@bedrock-forge/shared';

const ALL_SCAN_TYPES: SecurityScanType[] = [
	...SERVER_SCAN_TYPES,
	...ENVIRONMENT_SCAN_TYPES,
];

export class TriggerServerScanDto {
	@IsArray()
	@ArrayMinSize(1)
	@IsEnum(SERVER_SCAN_TYPES, { each: true })
	types!: ('SSH_AUDIT' | 'SERVER_HARDENING' | 'MALWARE_SCAN')[];
}

export class TriggerEnvironmentScanDto {
	@IsArray()
	@ArrayMinSize(1)
	@IsEnum(ENVIRONMENT_SCAN_TYPES, { each: true })
	types!: SecurityScanType[];
}

export { ALL_SCAN_TYPES };
