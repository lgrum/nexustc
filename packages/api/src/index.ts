import { getLogger } from "@orpc/experimental-pino";
import { os } from "@orpc/server";
import { auth } from "@repo/auth";
import { getRedis } from "@repo/db";
import { recordCollectibleMetric } from "@repo/shared/collectibles";
import type { Permissions, Role } from "@repo/shared/permissions";
import type { AtLeastOne } from "@repo/shared/types";
import { z } from "zod";

import type { Context } from "./context";
import {
  assertCollectiblesMutationAllowed,
  CollectibleKernelError,
} from "./services/collectibles";
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
  FORBIDDEN: {
    status: 403,
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
  },
  NOT_FOUND: {
    status: 404,
  },
  PROFILE_CUSTOMIZATION_CONFLICT: {
    status: 409,
  },
  PROFILE_CUSTOMIZATION_INVALID: {
    data: z.object({ fieldErrors: z.record(z.string(), z.string()) }),
    status: 400,
  },
  RATE_LIMITED: {
    data: z.object({
      retryAfter: z.number(),
    }),
    status: 429,
  },
  UNAUTHORIZED: {
    status: 401,
  },
});

export const { router } = o;

export const publicProcedure = o;

function recordRateLimitDecision(
  context: Context,
  path: readonly string[],
  decision: "bypass" | "allowed" | "exceeded"
) {
  recordCollectibleMetric(
    (event) => {
      getLogger(context)?.info(
        { ...event, decision, path: path.join(".") },
        "Collectible rate-limit decision"
      );
    },
    {
      name: "rate_limit_decision",
      operation: `rate-limit.${decision}`,
    }
  );
}

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
  allowBypass = true,
  limit,
  windowSeconds,
}: {
  allowBypass?: boolean;
  limit: number;
  windowSeconds: number;
}) =>
  o.middleware(async ({ context, errors, next, path }) => {
    if (
      process.env.NODE_ENV === "development" ||
      context.isSharedCacheContext
    ) {
      recordRateLimitDecision(context, path, "bypass");
      return next();
    }

    if (allowBypass && context.session?.user) {
      const allowed = await auth.api.userHasPermission({
        body: {
          permissions: { ratelimit: ["bypass"] },
          role: context.session.user.role as Role,
          userId: context.session.user.id,
        },
      });

      if (allowed.success) {
        recordRateLimitDecision(context, path, "bypass");
        return next();
      }
    }

    const ip = context.headers.get("cf-connecting-ip") ?? "unknown";
    const identifier = getIdentifier({ ip, session: context.session });
    const window = getCurrentWindow(windowSeconds);
    const key = getRateLimitKey({
      identifier,
      path,
      strategy: "fixed",
      window,
    });

    const { exceeded } = await checkFixedWindowRateLimit(
      await getRedis(),
      key,
      limit,
      windowSeconds
    );

    if (exceeded) {
      recordRateLimitDecision(context, path, "exceeded");
      throw errors.RATE_LIMITED({
        data: { retryAfter: calculateRetryAfter(windowSeconds) },
        message:
          "Estas realizando demasiadas acciones seguidas. Espera un momento e intentalo de nuevo.",
      });
    }

    recordRateLimitDecision(context, path, "allowed");
    return next();
  });

export const slidingWindowRatelimitMiddleware = (
  limit: number,
  windowSeconds: number
) =>
  o.middleware(async ({ context, errors, next, path }) => {
    if (
      process.env.NODE_ENV === "development" ||
      context.isSharedCacheContext
    ) {
      recordRateLimitDecision(context, path, "bypass");
      return next();
    }

    if (context.session?.user) {
      const allowed = await auth.api.userHasPermission({
        body: {
          permissions: { ratelimit: ["bypass"] },
          role: context.session.user.role as Role,
        },
      });

      if (allowed.success) {
        recordRateLimitDecision(context, path, "bypass");
        return next();
      }
    }

    const ip = context.headers.get("cf-connecting-ip");
    const now = Date.now();
    const identifier = getIdentifier({ ip, session: context.session });
    const key = getRateLimitKey({ identifier, path, strategy: "sliding" });

    const { exceeded } = await checkSlidingWindowRateLimit(
      await getRedis(),
      key,
      limit,
      windowSeconds,
      now
    );

    if (exceeded) {
      recordRateLimitDecision(context, path, "exceeded");
      throw errors.RATE_LIMITED({
        data: { retryAfter: calculateRetryAfter(windowSeconds) },
        message:
          "Estas realizando demasiadas acciones seguidas. Espera un momento e intentalo de nuevo.",
      });
    }

    recordRateLimitDecision(context, path, "allowed");
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
        body: { permissions, role: user.role as Role, userId: user.id },
      });

      if (!allowed.success) {
        throw errors.FORBIDDEN();
      }

      return next();
    })
  );

/**
 * Shared boundary for every future collectible mutation. Routers still own
 * input validation and capability selection, while this middleware guarantees
 * the global gate and the no-impersonation rule are applied consistently.
 */
export const collectiblesMutationMiddleware = o.middleware(
  ({ context, next, errors }) => {
    try {
      assertCollectiblesMutationAllowed({
        impersonated: Boolean(context.session?.session?.impersonatedBy),
      });
    } catch (error) {
      if (error instanceof CollectibleKernelError) {
        throw errors.FORBIDDEN({ message: error.message });
      }
      throw error;
    }

    return next();
  }
);
