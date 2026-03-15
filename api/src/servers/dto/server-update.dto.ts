import {
	ArrayMaxSize,
	IsArray,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

const providers = [
	'hetzner',
	'cyberpanel',
	'cpanel',
	'digitalocean',
	'vultr',
	'linode',
	'custom',
] as const;

const panelTypes = [
	'cyberpanel',
	'cpanel',
	'plesk',
	'directadmin',
	'none',
] as const;

export class ServerUpdateDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	hostname?: string;

	@IsOptional()
	@IsString()
	@IsIn(providers)
	provider?: (typeof providers)[number];

	@IsOptional()
	@IsString()
	@MaxLength(100)
	ssh_user?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	ssh_port?: number;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	ssh_key_path?: string;

	@IsOptional()
	@IsString()
	ssh_password?: string;

	@IsOptional()
	@IsString()
	ssh_private_key?: string;

	@IsOptional()
	@IsString()
	@IsIn(panelTypes)
	panel_type?: (typeof panelTypes)[number];

	@IsOptional()
	@IsString()
	@MaxLength(500)
	panel_url?: string;

	@IsOptional()
	@IsString()
	panel_username?: string;

	@IsOptional()
	@IsString()
	panel_password?: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	uploads_path?: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(40)
	@IsString({ each: true })
	tags?: string[];
}
