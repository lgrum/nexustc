/**
 * Redis operation abstractions for rate limiting.
 * These functions take a Redis client as a parameter, enabling easy testing with mocks.
 */

import type { RedisClientType } from "redis";

import { isLimitExceeded } from "./rate-limit";

type RateLimitResult = {
  exceeded: boolean;
  count: number;
};

/**
 * Checks and updates the fixed window rate limit.
 *
 * @param cache - Redis client instance
 * @param key - Rate limit key
 * @param limit - Maximum number of requests allowed
 * @param windowSeconds - Window duration in seconds
 * @returns Whether the limit was exceeded and current count
 */
export async function checkFixedWindowRateLimit(
  cache: RedisClientType,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const count = await cache.incr(key);

  if (count === 1) {
    await cache.expire(key, windowSeconds);
  }

  return {
    count,
    exceeded: isLimitExceeded(count, limit),
  };
}

/**
 * Checks and updates the sliding window rate limit.
 *
 * @param cache - Redis client instance
 * @param key - Rate limit key
 * @param limit - Maximum number of requests allowed
 * @param windowSeconds - Window duration in seconds
 * @param now - Current timestamp in milliseconds
 * @returns Whether the limit was exceeded and current count
 */
export async function checkSlidingWindowRateLimit(
  cache: RedisClientType,
  key: string,
  limit: number,
  windowSeconds: number,
  now: number
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;

  // Remove expired entries outside the sliding window
  await cache.zRemRangeByScore(key, 0, now - windowMs);

  // Get current request count
  const count = await cache.zCard(key);

  // Check if adding this request would exceed the limit
  if (count >= limit) {
    return { count, exceeded: true };
  }

  // Add new entry and set expiration
  await Promise.all([
    cache.zAdd(key, { score: now, value: now.toString() }),
    cache.expire(key, windowSeconds),
  ]);

  return { count: count + 1, exceeded: false };
}
