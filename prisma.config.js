require('dotenv/config');
const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
	},
	datasource: {
		// Read directly from process.env so `prisma generate` works in Docker
		// build stage where DATABASE_URL isn't present.
		url: process.env.DATABASE_URL ?? '',
	},
});
