import * as winston from "winston";
import { correlationIdStorage } from "./correlation-id.context";

const appendCorrelationId = winston.format((info) => {
  const correlationId = correlationIdStorage.getStore();
  if (correlationId) {
    info.correlationId = correlationId;
  }
  return info;
});

export const winstonLoggerOptions: winston.LoggerOptions = {
  transports: [
    new winston.transports.Console({
      level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
      format: process.env.NODE_ENV === "production"
        ? winston.format.combine(
            appendCorrelationId(),
            winston.format.timestamp(),
            winston.format.json(),
          )
        : winston.format.combine(
            appendCorrelationId(),
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, correlationId, ...meta }) => {
              const corrStr = correlationId ? ` [${correlationId}]` : "";
              const ctxStr = context ? ` [${context}]` : "";
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
              return `${timestamp} ${level}${ctxStr}${corrStr}: ${message}${metaStr}`;
            }),
          ),
    }),
  ],
};
