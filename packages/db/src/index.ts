import { env } from "@repo/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { createClient } from "redis";
import type { RedisClientType } from "redis";

import * as appSchema from "./schema/app";
import * as notificationSchema from "./schema/notification";

const schema = {
  ...appSchema,
  ...notificationSchema,
};

export const db = drizzle(env.DATABASE_URL, {
  schema,
});

let client: RedisClientType | null = null;
let clientPromise: Promise<RedisClientType> | null = null;
const REDIS_CONNECT_TIMEOUT_MS = 500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis connect timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    void (async () => {
      try {
        resolve(await promise);
      } catch (error) {
        reject(error);
      } finally {
        clearTimeout(timeout);
      }
    })();
  });
}

export function getRedis(): Promise<RedisClientType> {
  if (client?.isReady) {
    return Promise.resolve(client);
  }

  if (!client && clientPromise) {
    return clientPromise;
  }

  clientPromise = null;

  clientPromise = (async () => {
    const nextClient = createClient({
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: false,
      },
      url: env.REDIS_URL,
    }) as RedisClientType;
    nextClient.on("error", (err) => {
      console.error("Redis error", err);
    });

    try {
      await withTimeout(nextClient.connect(), REDIS_CONNECT_TIMEOUT_MS);
      client = nextClient;
      return nextClient;
    } catch (error) {
      client = null;
      clientPromise = null;
      try {
        nextClient.destroy();
      } catch {
        // Ignore cleanup errors after a failed connection attempt.
      }
      throw error;
    }
  })();

  return clientPromise;
}

// Re-export commonly used drizzle-orm functions to ensure all packages use the same instance
export {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";

// Re-export schema
// oxlint-disable-next-line oxc/no-barrel-file
export * from "./schema/app";
// oxlint-disable-next-line oxc/no-barrel-file
export * from "./schema/notification";
