import { IsArray, IsInt, IsPositive } from 'class-validator';

export interface ScannedProject {
	/** Absolute path on the server, e.g. /home/mysite/public_html */
	path: string;
	/** Derived from composer.json name field or the directory name */
	name: string;
	isBedrock: boolean;
	isWordPress: boolean;
	/** Extracted from WP_HOME / SITE_URL in .env, or wp-config.php */
	siteUrl?: string;
	/** True when DB credentials were successfully parsed */
	hasDbCredentials: boolean;
	/**
	 * Raw (plaintext) credentials parsed from .env / wp-config.php.
	 * Never re-returned from the bulk import response — only used inbound.
	 */
	dbCredentials?: {
		dbName: string;
		dbUser: string;
		dbPassword: string;
		dbHost: string;
	};
	/**
	 * If the hostname is a subdomain, this is the registrable root domain.
	 * e.g. hostname=staging.example.com → mainDomain=example.com
	 * Undefined when the hostname IS already the root domain.
	 */
	mainDomain?: string;
	/** True when this path already has an Environment record on this server */
	alreadyImported: boolean;
	/** If alreadyImported, the project ID it belongs to */
	existingProjectId?: string;
	/** ID of the server where this project was found */
	serverId: number;
	/** Display name of the server */
	serverName: string;
}

export class ScanProjectsMultiDto {
	@IsArray()
	@IsInt({ each: true })
	@IsPositive({ each: true })
	serverIds!: number[];
}
