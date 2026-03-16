import { WpDbCredentials } from '@bedrock-forge/shared';

/**
 * CredentialParserService
 *
 * Extracts WordPress DB credentials from raw wp-config.php content using
 * regex only. NEVER sources, evals, requires, or spawns any file.
 *
 * Handles all real-world wp-config.php patterns:
 * - define('DB_NAME', 'mydb');
 * - define( "DB_NAME", "mydb" );
 * - define('DB_PASSWORD', 'p@$$w0rd!123');
 * - .env style: DB_NAME=mydb
 * - Constants defined in any order
 * - Whitespace variations
 * - Values containing special characters (colons, slashes, etc.)
 */
export class CredentialParserService {
	/**
	 * Parse wp-config.php file content and extract DB credentials.
	 * Returns null if any required credential is missing.
	 */
	parseWpConfig(content: string): WpDbCredentials | null {
		const dbName = this.extractDefine(content, 'DB_NAME');
		const dbUser = this.extractDefine(content, 'DB_USER');
		const dbPassword = this.extractDefine(content, 'DB_PASSWORD');
		const dbHost = this.extractDefine(content, 'DB_HOST');

		if (!dbName || !dbUser || !dbPassword || !dbHost) {
			return null;
		}

		return { dbName, dbUser, dbPassword, dbHost };
	}

	/**
	 * Parse .env file content and extract DB credentials.
	 * Returns null if any required credential is missing.
	 */
	parseEnvFile(content: string): WpDbCredentials | null {
		const dbName = this.extractEnv(content, 'DB_NAME');
		const dbUser = this.extractEnv(content, 'DB_USER');
		const dbPassword = this.extractEnv(content, 'DB_PASSWORD');
		const dbHost = this.extractEnv(content, 'DB_HOST');

		if (!dbName || !dbUser || !dbPassword || !dbHost) {
			return null;
		}

		return { dbName, dbUser, dbPassword, dbHost };
	}

	/**
	 * Auto-detect format and parse. Tries wp-config.php format first,
	 * falls back to .env format.
	 */
	parse(content: string): WpDbCredentials | null {
		const wpResult = this.parseWpConfig(content);
		if (wpResult) return wpResult;
		return this.parseEnvFile(content);
	}

	/**
	 * Extract a define('KEY', 'value') or define("KEY", "value") statement.
	 *
	 * Handles:
	 *   define('DB_NAME', 'mydb');
	 *   define( 'DB_NAME', 'mydb' );
	 *   define("DB_NAME", "mydb");
	 *   define ( "DB_NAME" , "mydb" ) ;
	 *   Values with special chars: !, @, #, $, %, ^, &, *, (, ), -, _, +, =, [, ], {, }, |, ;, :, ', ", ,, ., <, >, ?, /, `, ~
	 */
	private extractDefine(content: string, key: string): string | null {
		// Match: define( QUOTE KEY QUOTE , QUOTE VALUE QUOTE )
		// The value regex [^'"]* won't work for passwords with quotes.
		// We use a more careful approach: match everything up to the closing quote
		// that's followed by optional whitespace and ) or ,
		const singleQuotePattern = new RegExp(
			`define\\s*\\(\\s*'${key}'\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*\\)`,
			'i',
		);
		const doubleQuotePattern = new RegExp(
			`define\\s*\\(\\s*"${key}"\\s*,\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*\\)`,
			'i',
		);

		const singleMatch = content.match(singleQuotePattern);
		if (singleMatch?.[1] !== undefined) {
			return this.unescape(singleMatch[1]);
		}

		const doubleMatch = content.match(doubleQuotePattern);
		if (doubleMatch?.[1] !== undefined) {
			return this.unescape(doubleMatch[1]);
		}

		return null;
	}

	/**
	 * Extract a KEY=value or KEY="value" or KEY='value' line from .env content.
	 *
	 * Handles:
	 *   DB_NAME=mydb
	 *   DB_NAME="mydb"
	 *   DB_NAME='mydb'
	 *   DB_PASSWORD="p@$$w0rd!#123"
	 *   Lines with # comments after value
	 */
	private extractEnv(content: string, key: string): string | null {
		// Quoted value
		const quotedPattern = new RegExp(
			`^${key}\\s*=\\s*['"]((?:[^'"\\\\]|\\\\.)*)['"]`,
			'im',
		);
		const quotedMatch = content.match(quotedPattern);
		if (quotedMatch?.[1] !== undefined) {
			return this.unescape(quotedMatch[1]);
		}

		// Unquoted value (ends at whitespace or # comment)
		const unquotedPattern = new RegExp(`^${key}\\s*=\\s*([^\\s#'"]+)`, 'im');
		const unquotedMatch = content.match(unquotedPattern);
		if (unquotedMatch?.[1] !== undefined) {
			return unquotedMatch[1].trim();
		}

		return null;
	}

	/**
	 * Unescape backslash-escaped characters in PHP string values.
	 * PHP single-quoted strings only escape \\ and \'.
	 * PHP double-quoted strings escape \\, \", \n, \t, \r, \$, \0.
	 */
	private unescape(value: string): string {
		return value
			.replace(/\\'/g, "'")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, '\\');
	}
}

// Singleton export for convenience
export const credentialParser = new CredentialParserService();
