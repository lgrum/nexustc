import { os } from "@orpc/server";
import { auth } from "@repo/auth";
import { getRedis } from "@repo/db";
import type { Permissions, Role } from "@repo/shared/permissions";
import type { AtLeastOne } from "@repo/shared/types";
import { z } from "zod";
import type { Context } from "./context";
import {
  calculateRetryAfter,
  getCurrentWindow,
  getIdentifier,
  getRateLimitKey,
} from "./utils/rate-limit";
import {
  checkFixedWindowRateLimit,
  checkSlidingWindowRateLimit,
} from "./utils/redis-operations";

export const o = os.$context<Context>().errors({
  BAD_REQUEST: {
    status: 400,
  },
  UNAUTHORIZED: {
    status: 401,
  },
  FORBIDDEN: {
    status: 403,
  },
  NOT_FOUND: {
    status: 404,
  },
  RATE_LIMITED: {
    status: 429,
    data: z.object({
      retryAfter: z.number(),
    }),
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
  },
});

export const router = o.router;

export const publicProcedure = o;

const requireAuth = o.middleware(({ context, next, errors }) => {
  if (!context.session?.user) {
    throw errors.UNAUTHORIZED();
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const fixedWindowRatelimitMiddleware = ({
  limit,
  windowSeconds,
}: {
  limit: number;
  windowSeconds: number;
}) =>
  o.middleware(async ({ context, errors, next, path }) => {
    if (process.env.NODE_ENV === "development") {
      return next();
    }

    const ip = context.headers.get("cf-connecting-ip") ?? "unknown";
    const identifier = getIdentifier({ session: context.session, ip });
    const window = getCurrentWindow(windowSeconds);
    const key = getRateLimitKey({
      strategy: "fixed",
      identifier,
      path,
      window,
    });

    const { exceeded } = await checkFixedWindowRateLimit(
      await getRedis(),
      key,
      limit,
      windowSeconds
    );

    if (exceeded) {
      throw errors.RATE_LIMITED({
        data: { retryAfter: calculateRetryAfter(windowSeconds) },
      });
    }

    return next();
  });

export const slidingWindowRatelimitMiddleware = (
  limit: number,
  windowSeconds: number
) =>
  o.middleware(async ({ context, errors, next, path }) => {
    if (process.env.NODE_ENV === "development") {
      return next();
    }

    const ip = context.headers.get("cf-connecting-ip");
    const now = Date.now();
    const identifier = getIdentifier({ session: context.session, ip });
    const key = getRateLimitKey({ strategy: "sliding", identifier, path });

    const { exceeded } = await checkSlidingWindowRateLimit(
      await getRedis(),
      key,
      limit,
      windowSeconds,
      now
    );

    if (exceeded) {
      throw errors.RATE_LIMITED({
        data: { retryAfter: calculateRetryAfter(windowSeconds) },
      });
    }

    return next();
  });

export const protectedProcedure = publicProcedure.use(requireAuth);

export const ownerProcedure = protectedProcedure.use(
  o.middleware(({ context, next, errors }) => {
    if (context.session!.user.role !== "owner") {
      throw errors.FORBIDDEN();
    }

    return next();
  })
);

export const permissionProcedure = (permissions: AtLeastOne<Permissions>) =>
  protectedProcedure.use(
    o.middleware(async ({ context, next, errors }) => {
      const user = context.session?.user;

      if (!user) {
        throw errors.UNAUTHORIZED();
      }

      if (!user.role) {
        throw errors.FORBIDDEN();
      }

      const allowed = await auth.api.userHasPermission({
        body: { userId: user.id, role: user.role as Role, permissions },
      });

      if (!allowed.success) {
        throw errors.FORBIDDEN();
      }

      return next();
    })
  );
