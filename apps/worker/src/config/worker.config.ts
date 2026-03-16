export default () => ({
	redis: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
	database: { url: process.env.DATABASE_URL },
	encryption: { key: process.env.ENCRYPTION_KEY },
	scriptsPath: process.env.SCRIPTS_PATH ?? '/app/scripts',
});
