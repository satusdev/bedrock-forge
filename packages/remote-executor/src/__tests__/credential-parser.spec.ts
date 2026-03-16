import { CredentialParserService } from '../credential-parser.service';

describe('CredentialParserService', () => {
	const parser = new CredentialParserService();

	// ─── wp-config.php: standard single-quote format ──────────────────────────

	it('parses standard single-quoted wp-config.php', () => {
		const content = `
<?php
define('DB_NAME', 'my_database');
define('DB_USER', 'wp_user');
define('DB_PASSWORD', 'secret123');
define('DB_HOST', 'localhost');
    `;
		expect(parser.parseWpConfig(content)).toEqual({
			dbName: 'my_database',
			dbUser: 'wp_user',
			dbPassword: 'secret123',
			dbHost: 'localhost',
		});
	});

	// ─── wp-config.php: double-quote format ───────────────────────────────────

	it('parses double-quoted wp-config.php', () => {
		const content = `
define("DB_NAME", "my_database");
define("DB_USER", "wp_user");
define("DB_PASSWORD", "secret123");
define("DB_HOST", "localhost");
    `;
		expect(parser.parseWpConfig(content)).toEqual({
			dbName: 'my_database',
			dbUser: 'wp_user',
			dbPassword: 'secret123',
			dbHost: 'localhost',
		});
	});

	// ─── wp-config.php: extra whitespace ──────────────────────────────────────

	it('handles whitespace variations', () => {
		const content = `
define( 'DB_NAME' , 'spaced_db' );
define( 'DB_USER' , 'spaced_user' );
define( 'DB_PASSWORD' , 'spaced_pass' );
define( 'DB_HOST' , '127.0.0.1' );
    `;
		const result = parser.parseWpConfig(content);
		expect(result?.dbName).toBe('spaced_db');
		expect(result?.dbHost).toBe('127.0.0.1');
	});

	// ─── wp-config.php: special characters in password ────────────────────────

	it('handles passwords with special characters', () => {
		const content = `
define('DB_NAME', 'forge_db');
define('DB_USER', 'forge_user');
define('DB_PASSWORD', 'P@$$w0rd!#&*()-_+=[]{}|;:,.<>?/\`~');
define('DB_HOST', 'db.example.com:3306');
    `;
		const result = parser.parseWpConfig(content);
		expect(result?.dbPassword).toBe('P@$$w0rd!#&*()-_+=[]{}|;:,.<>?/`~');
		expect(result?.dbHost).toBe('db.example.com:3306');
	});

	// ─── wp-config.php: escaped single quote in password ─────────────────────

	it('handles escaped single quote in password', () => {
		const content = `define('DB_PASSWORD', 'it\\'s-a-pass');`;
		const result = parser.parseWpConfig(content);
		expect(result?.dbPassword).toBe("it's-a-pass");
	});

	// ─── wp-config.php: mixing define order ───────────────────────────────────

	it('handles defines in any order', () => {
		const content = `
define('DB_HOST', 'localhost');
define('DB_PASSWORD', 'pass');
define('DB_NAME', 'db');
define('DB_USER', 'user');
    `;
		const result = parser.parseWpConfig(content);
		expect(result?.dbName).toBe('db');
		expect(result?.dbUser).toBe('user');
	});

	// ─── wp-config.php: missing credential ───────────────────────────────────

	it('returns null if any credential is missing', () => {
		const content = `
define('DB_NAME', 'mydb');
define('DB_USER', 'user');
    `;
		expect(parser.parseWpConfig(content)).toBeNull();
	});

	// ─── .env format: unquoted ────────────────────────────────────────────────

	it('parses unquoted .env file', () => {
		const content = `
DB_NAME=mydb
DB_USER=myuser
DB_PASSWORD=mypassword
DB_HOST=localhost
    `;
		expect(parser.parseEnvFile(content)).toEqual({
			dbName: 'mydb',
			dbUser: 'myuser',
			dbPassword: 'mypassword',
			dbHost: 'localhost',
		});
	});

	// ─── .env format: quoted values ───────────────────────────────────────────

	it('parses quoted .env file', () => {
		const content = `
DB_NAME="my_database"
DB_USER="wp_user"
DB_PASSWORD="s3cr3t!@#"
DB_HOST="127.0.0.1"
    `;
		const result = parser.parseEnvFile(content);
		expect(result?.dbPassword).toBe('s3cr3t!@#');
		expect(result?.dbHost).toBe('127.0.0.1');
	});

	// ─── .env format: with comments ───────────────────────────────────────────

	it('ignores inline comments in .env', () => {
		const content = `
DB_NAME=mydb # primary database
DB_USER=myuser
DB_PASSWORD=mypass
DB_HOST=localhost
    `;
		const result = parser.parseEnvFile(content);
		expect(result?.dbName).toBe('mydb');
	});

	// ─── auto-detect ─────────────────────────────────────────────────────────

	it('auto-detects wp-config.php format', () => {
		const content = `define('DB_NAME', 'd'); define('DB_USER', 'u'); define('DB_PASSWORD', 'p'); define('DB_HOST', 'h');`;
		const result = parser.parse(content);
		expect(result?.dbName).toBe('d');
	});

	it('auto-detects .env format fallback', () => {
		const content = `DB_NAME=d\nDB_USER=u\nDB_PASSWORD=p\nDB_HOST=h`;
		const result = parser.parse(content);
		expect(result?.dbName).toBe('d');
	});
});
