import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? "",
    });
    const adapter = new PrismaPg(pool as any);
    super({ adapter });

    const maxRetries = 3;
    const transientErrorCodes = ["P1001", "P1017", "P2025"];

    const client = this.$extends({
      query: {
        $allOperations({ operation, args, query }) {
          let delay = 100;
          const execute = async (attempt: number): Promise<any> => {
            try {
              return await query(args);
            } catch (err: any) {
              const isTransient =
                transientErrorCodes.includes(err.code) ||
                err.message?.includes("ECONNRESET") ||
                err.message?.includes("ETIMEDOUT") ||
                err.message?.includes("connection pool") ||
                err.message?.includes("Pool timeout") ||
                err.message?.includes("too many connections");

              if (isTransient && attempt < maxRetries) {
                await new Promise((res) => setTimeout(res, delay));
                delay *= 2;
                return execute(attempt + 1);
              }
              throw err;
            }
          };
          return execute(1);
        },
      },
    });

    (client as any).onModuleInit = async () => {
      await (client as any).$connect();
      this.logger.log("Database connected");
    };

    (client as any).onModuleDestroy = async () => {
      await (client as any).$disconnect();
      this.logger.log("Database disconnected");
    };

    return client as any;
  }

  // Dummy methods to satisfy TypeScript implements clause
  async onModuleInit() {}
  async onModuleDestroy() {}
}
