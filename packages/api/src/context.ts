import { CONTEXT_LOGGER_SYMBOL } from "@orpc/experimental-pino";
import type { LoggerContext } from "@orpc/experimental-pino";
import { auth } from "@repo/auth";
import { db } from "@repo/db";
import { pino } from "pino";

export type Context = {
  headers: Headers;
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  db: typeof db;
} & LoggerContext;

const logger = pino({
  level: process.env.LOG_LEVEL || "error",
  transport: {
    options: {
      colorize: true,
      depth: null,
    },
    target: "pino-pretty",
  },
});

export async function createContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({
    headers,
  });

  return {
    headers,
    session,
    db,
    [CONTEXT_LOGGER_SYMBOL]: logger,
  };
}
