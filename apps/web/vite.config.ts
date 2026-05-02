import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const { version } = JSON.parse(
	readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string };

export default defineConfig({
	plugins: [react(), tailwindcss()],
	define: {
		__APP_VERSION__: JSON.stringify(version),
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, 'src'),
			'@bedrock-forge/shared': resolve(
				__dirname,
				'../../packages/shared/src/index.ts',
			),
		},
	},
	server: {
		port: 5173,
		proxy: {
			'/api': { target: 'http://localhost:3000', changeOrigin: true },
			'/ws': { target: 'ws://localhost:3000', ws: true },
		},
	},
	build: {
		outDir: 'dist',
		sourcemap: false,
	},
});
