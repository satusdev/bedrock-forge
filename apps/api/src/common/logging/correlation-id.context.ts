import { AsyncLocalStorage } from "async_hooks";

export const correlationIdStorage = new AsyncLocalStorage<string>();
