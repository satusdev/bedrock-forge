import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { AppModule } from './app.module';
import { MalformedJsonExceptionFilter } from './common/filters/malformed-json.filter';
import { WebsocketCompatService } from './websocket/websocket-compat.service';

function parseCorsOrigins(rawOrigins: string | undefined): string[] {
	if (!rawOrigins) {
		return [];
	}

	const value = rawOrigins.trim();
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value) as unknown;
		if (Array.isArray(parsed)) {
			return parsed
				.filter((origin): origin is string => typeof origin === 'string')
				.map(origin => origin.trim())
				.filter(origin => origin.length > 0);
		}
	} catch {
		// Fall back to comma-separated format
	}

	return value
		.split(',')
		.map(origin => origin.trim())
		.filter(origin => origin.length > 0);
}

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		bodyParser: false,
	});
	const apiPrefix = process.env.API_PREFIX ?? 'api/v1';
	const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

	app.use(
		json({
			strict: false,
			limit: '1mb',
		}),
	);
	app.use(
		urlencoded({
			extended: true,
			limit: '1mb',
		}),
	);

	app.enableCors({
		origin: corsOrigins.length > 0 ? corsOrigins : true,
		credentials: true,
	});

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);
	app.useGlobalFilters(new MalformedJsonExceptionFilter());

	app.setGlobalPrefix(apiPrefix);

	const port = Number.parseInt(process.env.PORT ?? '8100', 10);
	await app.listen(port);

	const websocketService = app.get(WebsocketCompatService);
	const wsServer = new WebSocketServer({ noServer: true });
	const normalizedPrefix = apiPrefix.replace(/^\/+|\/+$/g, '');
	const wsPathPrefix = `/${normalizedPrefix}/ws/`;

	const httpServer = app.getHttpServer() as Server;
	httpServer.on('upgrade', (request, socket, head) => {
		const requestUrl = request.url;
		if (!requestUrl) {
			socket.destroy();
			return;
		}

		const origin = `http://${request.headers.host ?? 'localhost'}`;
		const pathname = new URL(requestUrl, origin).pathname;
		if (!pathname.startsWith(wsPathPrefix)) {
			socket.destroy();
			return;
		}

		const encodedClientId = pathname.slice(wsPathPrefix.length);
		if (!encodedClientId) {
			socket.destroy();
			return;
		}

		const clientId = decodeURIComponent(encodedClientId);
		wsServer.handleUpgrade(request, socket, head, webSocket => {
			websocketService.connect(clientId, webSocket);
			webSocket.on('message', data => {
				websocketService.handleIncomingMessage(clientId, data.toString());
			});
			webSocket.on('close', () => {
				websocketService.disconnect(clientId);
			});
			webSocket.on('error', () => {
				websocketService.disconnect(clientId);
			});
		});
	});
}

void bootstrap();
