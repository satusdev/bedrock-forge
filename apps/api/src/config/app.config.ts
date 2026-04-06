export default () => ({
	app: {
		port: parseInt(process.env.API_PORT ?? '3000', 10),
		env: process.env.NODE_ENV ?? 'development',
		corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:8080',
		backupStoragePath: process.env.BACKUP_STORAGE_PATH ?? '/var/forge/backups',
		rcloneConfigPath:
			process.env.RCLONE_CONFIG_PATH ?? '/home/node/.config/rclone/rclone.conf',
		rcloneRemoteName: process.env.RCLONE_REMOTE_NAME ?? 'gdrive',
	},
	database: {
		url: process.env.DATABASE_URL,
	},
	redis: {
		url: process.env.REDIS_URL ?? 'redis://localhost:6379',
	},
	jwt: {
		secret: process.env.JWT_SECRET,
		refreshSecret: process.env.JWT_REFRESH_SECRET,
		accessExpiresIn: '15m',
		refreshExpiresIn: '7d',
	},
	encryption: {
		key: process.env.ENCRYPTION_KEY,
	},
});
