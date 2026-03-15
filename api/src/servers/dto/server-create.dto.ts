import {
	ArrayMaxSize,
	IsArray,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	MinLength,
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

export class ServerCreateDto {
	@IsString()
	@MinLength(1)
	@MaxLength(255)
	name!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(255)
	hostname!: string;

	@IsOptional()
	@IsString()
	@IsIn(providers)
	provider?: (typeof providers)[number] = 'custom';

	@IsOptional()
	@IsString()
	@MaxLength(100)
	ssh_user?: string = 'root';

	@IsOptional()
	@IsInt()
	@Min(1)
	ssh_port?: number = 22;

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
	panel_type?: (typeof panelTypes)[number] = 'none';

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
	@IsArray()
	@ArrayMaxSize(40)
	@IsString({ each: true })
	tags?: string[];
}
