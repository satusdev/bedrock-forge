import { IsString, MaxLength } from 'class-validator';

export class DetectBedrockDto {
	@IsString()
	@MaxLength(500)
	path!: string;
}

export interface BedrockDetectionResult {
	isBedrock: boolean;
	isWordPress: boolean;
	/** Suggested project name derived from folder name or composer.json */
	projectName: string;
	/** WP_HOME / WP_SITEURL extracted from .env or wp-config.php */
	siteUrl?: string;
	dbCredentials?: {
		dbName: string;
		dbUser: string;
		dbPassword: string;
		dbHost: string;
	};
	composerJson?: Record<string, unknown>;
	detectedPaths: {
		/** Path to the application config (application.php or wp-config.php) */
		config: string;
		/** Web root (web/ for Bedrock, same as rootPath for plain WP) */
		webRoot: string;
	};
}
