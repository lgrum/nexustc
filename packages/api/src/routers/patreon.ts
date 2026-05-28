import { getLogger } from "@orpc/experimental-pino";
import { and, eq, gte, ilike, lte, sql } from "@repo/db";
import { account, patreonWebhookRequest, patron } from "@repo/db/schema/app";
import { env } from "@repo/env";
import {
  PATRON_TIERS,
  resolvePermanentPatronTierStatus,
} from "@repo/shared/constants";
import * as z from "zod";

import {
  fixedWindowRatelimitMiddleware,
  ownerProcedure,
  protectedProcedure,
} from "../index";
import {
  determineTierFromIds,
  fetchPatreonMembership,
  refreshPatreonToken,
} from "../utils/patreon";

const webhookProcessingStatusSchema = z.enum([
  "stored",
  "processed",
  "ignored",
  "invalid",
  "failed",
]);

const webhookMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const webhookRequestsFilterSchema = z.object({
  body: z.string().trim().min(1).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  event: z.string().trim().min(1).optional(),
  method: webhookMethodSchema.optional(),
  processingStatus: webhookProcessingStatusSchema.optional(),
  responseStatus: z.coerce.number().int().min(100).max(599).optional(),
  signature: z.string().trim().min(1).optional(),
});

export default {
  admin: {
    listWebhookRequests: ownerProcedure
      .input(
        z.object({
          filters: webhookRequestsFilterSchema.optional(),
          limit: z.number().int().min(1).max(100),
          offset: z.number().int().min(0),
        })
      )
      .handler(async ({ context: { db, ...ctx }, input }) => {
        const logger = getLogger(ctx);
        logger?.info("Fetching Patreon webhook request log");

        const conditions = [];
        const { filters } = input;

        if (filters?.createdFrom) {
          conditions.push(
            gte(patreonWebhookRequest.createdAt, filters.createdFrom)
          );
        }

        if (filters?.createdTo) {
          conditions.push(
            lte(patreonWebhookRequest.createdAt, filters.createdTo)
          );
        }

        if (filters?.event) {
          conditions.push(eq(patreonWebhookRequest.event, filters.event));
        }

        if (filters?.processingStatus) {
          conditions.push(
            eq(patreonWebhookRequest.processingStatus, filters.processingStatus)
          );
        }

        if (filters?.method) {
          conditions.push(eq(patreonWebhookRequest.method, filters.method));
        }

        if (filters?.responseStatus) {
          conditions.push(
            eq(patreonWebhookRequest.responseStatus, filters.responseStatus)
          );
        }

        if (filters?.body) {
          conditions.push(
            ilike(patreonWebhookRequest.body, `%${filters.body}%`)
          );
        }

        if (filters?.signature) {
          conditions.push(
            ilike(patreonWebhookRequest.signature, `%${filters.signature}%`)
          );
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const totalPromise = db
          .select({
            count: sql<number>`count(*)::integer`,
          })
          .from(patreonWebhookRequest)
          .where(where);

        const requestsPromise = db.query.patreonWebhookRequest.findMany({
          limit: input.limit,
          offset: input.offset,
          orderBy: (table, { desc }) => [desc(table.createdAt)],
          where,
        });

        const [total, requests] = await Promise.all([
          totalPromise,
          requestsPromise,
        ]);

        return {
          requests,
          total: total[0]?.count ?? 0,
        };
      }),
  },

  /**
   * Get current user's patron status and benefits
   */
  getStatus: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching patron status for user: ${session.user.id}`);

      const patronRecord = await db.query.patron.findFirst({
        where: (p, { eq: equals }) => equals(p.userId, session.user.id),
      });

      if (!patronRecord) {
        return {
          benefits: PATRON_TIERS.none,
          isPatron: false,
          lastSyncAt: null,
          tier: "none" as const,
        };
      }

      return {
        benefits: PATRON_TIERS[patronRecord.tier],
        isPatron: patronRecord.isActivePatron,
        lastSyncAt: patronRecord.lastSyncAt,
        patronSince: patronRecord.patronSince,
        pledgeAmountCents: patronRecord.pledgeAmountCents,
        tier: patronRecord.tier,
      };
    }
  ),

  /**
   * Manually sync patron status from Patreon API
   * Rate limited to 3 requests per 5 minutes
   */
  syncMembership: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 3, windowSeconds: 300 }))
    .handler(async ({ context: { db, session, ...ctx }, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(`Manual Patreon sync for user: ${session.user.id}`);

      // Get Patreon account
      const patreonAccount = await db.query.account.findFirst({
        where: (a, { and: andSql, eq: equals }) =>
          andSql(
            equals(a.userId, session.user.id),
            equals(a.providerId, "patreon")
          ),
      });

      if (!patreonAccount) {
        throw errors.NOT_FOUND({ message: "Cuenta de Patreon no vinculada." });
      }

      // Refresh token if expired
      let { accessToken } = patreonAccount;
      if (
        patreonAccount.accessTokenExpiresAt &&
        new Date(patreonAccount.accessTokenExpiresAt) < new Date()
      ) {
        if (!patreonAccount.refreshToken) {
          throw errors.UNAUTHORIZED({
            message:
              "Token de Patreon expirado. Por favor re-vincula tu cuenta.",
          });
        }

        logger?.debug(
          `Refreshing expired Patreon token for user ${session.user.id}`
        );
        const newTokens = await refreshPatreonToken(
          patreonAccount.refreshToken
        );
        ({ accessToken } = newTokens);

        // Update account with new tokens
        await db
          .update(account)
          .set({
            accessToken: newTokens.accessToken,
            accessTokenExpiresAt: new Date(
              Date.now() + newTokens.expiresIn * 1000
            ),
            refreshToken: newTokens.refreshToken,
          })
          .where(eq(account.id, patreonAccount.id));
      }

      if (!accessToken) {
        throw errors.UNAUTHORIZED({ message: "No access token available" });
      }

      // Fetch membership data
      const membership = await fetchPatreonMembership(
        accessToken,
        env.PATREON_CAMPAIGN_ID
      );

      // Determine tier from entitled tiers
      const tier = membership
        ? determineTierFromIds(membership.entitledTierIds)
        : "none";
      const existingPatron = await db.query.patron.findFirst({
        columns: {
          patronSince: true,
          tier: true,
        },
        where: (table, { eq: equals }) => equals(table.userId, session.user.id),
      });
      const patronStatus = resolvePermanentPatronTierStatus(existingPatron, {
        isActivePatron: membership?.isActive ?? false,
        patronSince: membership?.patronSince
          ? new Date(membership.patronSince)
          : null,
        tier,
      });

      // Upsert patron record
      await db
        .insert(patron)
        .values({
          isActivePatron: patronStatus.isActivePatron,
          lastSyncAt: new Date(),
          patreonUserId: patreonAccount.accountId,
          patronSince: patronStatus.patronSince,
          pledgeAmountCents: membership?.pledgeAmountCents ?? 0,
          tier: patronStatus.tier,
          userId: session.user.id,
        })
        .onConflictDoUpdate({
          set: {
            isActivePatron: patronStatus.isActivePatron,
            lastSyncAt: new Date(),
            patronSince: patronStatus.patronSince,
            pledgeAmountCents: membership?.pledgeAmountCents ?? 0,
            tier: patronStatus.tier,
          },
          target: patron.userId,
        });

      logger?.info(
        `Patron sync complete for user ${session.user.id}, tier: ${patronStatus.tier}`
      );

      return {
        benefits: PATRON_TIERS[patronStatus.tier],
        isActivePatron: patronStatus.isActivePatron,
        tier: patronStatus.tier,
      };
    }),
};
