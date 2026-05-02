import {
	IsArray,
	IsString,
	IsIn,
	ArrayMaxSize,
	Matches,
} from 'class-validator';

// Accepts: bare IPv4, IPv4 CIDR, bare IPv6, IPv6 CIDR
const CIDR_REGEX =
	/^(\d{1,3}\.){3}\d{1,3}(\/([12]?\d|3[0-2]))?$|^[0-9a-fA-F:]+(?:\/(?:12[0-8]|1[01]\d|[1-9]\d|\d))?$/;

export class UpdateSecuritySettingsDto {
	@IsArray()
	@ArrayMaxSize(100)
	@Matches(CIDR_REGEX, {
		each: true,
		message:
			'Each entry must be a valid IPv4/IPv6 address or CIDR range (e.g. 203.0.113.0/24)',
	})
	ip_allowlist!: string[];

	@IsString()
	@IsIn(['critical', 'high', 'medium', 'low', 'info'])
	notify_threshold!: string;
}
