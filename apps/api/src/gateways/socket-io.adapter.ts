import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { ConfigService } from "@nestjs/config";
import { INestApplication } from "@nestjs/common";

/**
 * Custom Socket.IO adapter that reads CORS_ORIGIN from the validated
 * ConfigService, rather than from process.env at module-load time.
 *
 * This ensures WebSocket CORS origin is consistent with the HTTP CORS
 * config set in main.ts and cannot silently diverge from the expected value.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly corsOrigin: string;

  constructor(app: INestApplication, config: ConfigService) {
    super(app);
    this.corsOrigin =
      config.get<string>("app.corsOrigin") ?? "http://localhost:8080";
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.corsOrigin,
        credentials: true,
      },
    });
    return server;
  }
}
