import { join } from 'path';

// Resolves to apps/worker/scripts/ from both dev (src/config/) and prod (dist/config/)
const DEFAULT_SCRIPTS_PATH = join(__dirname, '..', '..', 'scripts');

export default () => ({
	redis: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
	database: { url: process.env.DATABASE_URL },
	encryption: { key: process.env.ENCRYPTION_KEY },
	scriptsPath: process.env.SCRIPTS_PATH ?? DEFAULT_SCRIPTS_PATH,
	rclone: {
		configPath:
			process.env.RCLONE_CONFIG_PATH ?? '/home/node/.config/rclone/rclone.conf',
		remoteName: process.env.RCLONE_REMOTE_NAME ?? 'gdrive',
	},
});
