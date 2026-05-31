import { db as defaultDb, eq } from "@repo/db";
import { account, patron } from "@repo/db/schema/app";
import { env } from "@repo/env";
import {
  getHighestPatronTierFromIds,
  resolvePermanentPatronTierStatus,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";

import { fetchPatreonMembership, refreshPatreonToken } from "../utils/patreon";
import type { PatreonMembership } from "../utils/patreon";

type Database = typeof defaultDb;

type ReconciliationDependencies = {
  fetchMembership?: typeof fetchPatreonMembership;
  now?: () => Date;
  refreshToken?: typeof refreshPatreonToken;
};

export type PatreonReconciliationReason =
  | "active_membership_verified"
  | "expired_or_missing_membership"
  | "missing_linked_account"
  | "missing_access_token"
  | "missing_refresh_token"
  | "invalid_access_token"
  | "invalid_refresh_token"
  | "patreon_api_error"
  | "permanent_tier";

export type PatreonReconciliationResult = {
  action: "deactivated" | "failed" | "kept_active" | "skipped_permanent";
  error?: string;
  nextTier: PatronTier;
  patronId: string;
  patreonUserId: string;
  previousTier: PatronTier;
  reason: PatreonReconciliationReason;
  userId: string;
};

export type PatreonReconciliationSummary = {
  checked: number;
  deactivated: number;
  dryRun: boolean;
  failed: number;
  keptActive: number;
  results: PatreonReconciliationResult[];
  skippedPermanent: number;
};

type ReconcilePatreonMembershipsInput = {
  db?: Database;
  dependencies?: ReconciliationDependencies;
  dryRun?: boolean;
  limit?: number;
  patreonUserId?: string;
  userId?: string;
};

const DEFAULT_LIMIT = 100;
const PERMANENT_PATRON_TIERS = new Set<PatronTier>(["level69", "level100"]);

function isPermanentPatronTier(tier: PatronTier): boolean {
  return PERMANENT_PATRON_TIERS.has(tier);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Patreon error";
}

function isInvalidTokenError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("invalid") ||
    message.includes("unauthorized") ||
    message.includes("401")
  );
}

async function deactivatePatron({
  database,
  dryRun,
  now,
  patronId,
}: {
  database: Database;
  dryRun: boolean;
  now: Date;
  patronId: string;
}) {
  if (dryRun) {
    return;
  }

  await database
    .update(patron)
    .set({
      isActivePatron: false,
      lastSyncAt: now,
      patronSince: null,
      pledgeAmountCents: 0,
      tier: "none",
    })
    .where(eq(patron.id, patronId));
}

async function updatePatronFromMembership({
  database,
  dryRun,
  membership,
  now,
  patronRecord,
}: {
  database: Database;
  dryRun: boolean;
  membership: PatreonMembership;
  now: Date;
  patronRecord: {
    id: string;
    patronSince: Date | null;
    tier: PatronTier;
  };
}) {
  const tier = getHighestPatronTierFromIds(membership.entitledTierIds);
  const patronStatus = resolvePermanentPatronTierStatus(patronRecord, {
    isActivePatron: membership.isActive,
    patronSince: membership.patronSince
      ? new Date(membership.patronSince)
      : null,
    tier,
  });

  if (dryRun) {
    return patronStatus;
  }

  await database
    .update(patron)
    .set({
      isActivePatron: patronStatus.isActivePatron,
      lastSyncAt: now,
      patronSince: patronStatus.patronSince,
      pledgeAmountCents: membership.pledgeAmountCents,
      tier: patronStatus.tier,
    })
    .where(eq(patron.id, patronRecord.id));

  return patronStatus;
}

async function getFreshAccessToken({
  database,
  dependencies,
  dryRun,
  now,
  patreonAccount,
}: {
  database: Database;
  dependencies: Required<ReconciliationDependencies>;
  dryRun: boolean;
  now: Date;
  patreonAccount: {
    accessToken: string | null;
    accessTokenExpiresAt: Date | null;
    id: string;
    refreshToken: string | null;
  };
}): Promise<string | null> {
  if (!patreonAccount.accessToken) {
    return null;
  }

  if (
    !patreonAccount.accessTokenExpiresAt ||
    patreonAccount.accessTokenExpiresAt >= now
  ) {
    return patreonAccount.accessToken;
  }

  if (!patreonAccount.refreshToken) {
    return null;
  }

  const newTokens = await dependencies.refreshToken(
    patreonAccount.refreshToken
  );

  if (!dryRun) {
    await database
      .update(account)
      .set({
        accessToken: newTokens.accessToken,
        accessTokenExpiresAt: new Date(
          now.getTime() + newTokens.expiresIn * 1000
        ),
        refreshToken: newTokens.refreshToken,
      })
      .where(eq(account.id, patreonAccount.id));
  }

  return newTokens.accessToken;
}

function summarizeResults(
  results: PatreonReconciliationResult[],
  dryRun: boolean
): PatreonReconciliationSummary {
  let deactivated = 0;
  let failed = 0;
  let keptActive = 0;
  let skippedPermanent = 0;

  for (const result of results) {
    if (result.action === "deactivated") {
      deactivated += 1;
    } else if (result.action === "failed") {
      failed += 1;
    } else if (result.action === "kept_active") {
      keptActive += 1;
    } else {
      skippedPermanent += 1;
    }
  }

  return {
    checked: results.length,
    deactivated,
    dryRun,
    failed,
    keptActive,
    results,
    skippedPermanent,
  };
}

export async function reconcilePatreonMemberships({
  db = defaultDb,
  dependencies,
  dryRun = true,
  limit = DEFAULT_LIMIT,
  patreonUserId,
  userId,
}: ReconcilePatreonMembershipsInput = {}): Promise<PatreonReconciliationSummary> {
  const resolvedDependencies: Required<ReconciliationDependencies> = {
    fetchMembership: dependencies?.fetchMembership ?? fetchPatreonMembership,
    now: dependencies?.now ?? (() => new Date()),
    refreshToken: dependencies?.refreshToken ?? refreshPatreonToken,
  };
  const now = resolvedDependencies.now();
  const activePatrons = await db.query.patron.findMany({
    limit,
    where: (table, { and: allOf, eq: equals }) =>
      allOf(
        equals(table.isActivePatron, true),
        ...(userId ? [equals(table.userId, userId)] : []),
        ...(patreonUserId ? [equals(table.patreonUserId, patreonUserId)] : [])
      ),
  });
  const results: PatreonReconciliationResult[] = [];

  for (const patronRecord of activePatrons) {
    const baseResult = {
      patronId: patronRecord.id,
      patreonUserId: patronRecord.patreonUserId,
      previousTier: patronRecord.tier,
      userId: patronRecord.userId,
    };

    if (isPermanentPatronTier(patronRecord.tier)) {
      results.push({
        ...baseResult,
        action: "skipped_permanent",
        nextTier: patronRecord.tier,
        reason: "permanent_tier",
      });
      continue;
    }

    const patreonAccount = await db.query.account.findFirst({
      where: (table, { and: allOf, eq: equals }) =>
        allOf(
          equals(table.providerId, "patreon"),
          equals(table.accountId, patronRecord.patreonUserId)
        ),
    });

    if (!patreonAccount) {
      await deactivatePatron({
        database: db,
        dryRun,
        now,
        patronId: patronRecord.id,
      });
      results.push({
        ...baseResult,
        action: "deactivated",
        nextTier: "none",
        reason: "missing_linked_account",
      });
      continue;
    }

    let accessToken: string | null;
    try {
      accessToken = await getFreshAccessToken({
        database: db,
        dependencies: resolvedDependencies,
        dryRun,
        now,
        patreonAccount,
      });
    } catch (error) {
      await deactivatePatron({
        database: db,
        dryRun,
        now,
        patronId: patronRecord.id,
      });
      results.push({
        ...baseResult,
        action: "deactivated",
        error: getErrorMessage(error),
        nextTier: "none",
        reason: "invalid_refresh_token",
      });
      continue;
    }

    if (!accessToken) {
      const reason = patreonAccount.accessToken
        ? "missing_refresh_token"
        : "missing_access_token";
      await deactivatePatron({
        database: db,
        dryRun,
        now,
        patronId: patronRecord.id,
      });
      results.push({
        ...baseResult,
        action: "deactivated",
        nextTier: "none",
        reason,
      });
      continue;
    }

    let membership: PatreonMembership | null;
    try {
      membership = await resolvedDependencies.fetchMembership(
        accessToken,
        env.PATREON_CAMPAIGN_ID
      );
    } catch (error) {
      if (isInvalidTokenError(error)) {
        await deactivatePatron({
          database: db,
          dryRun,
          now,
          patronId: patronRecord.id,
        });
        results.push({
          ...baseResult,
          action: "deactivated",
          error: getErrorMessage(error),
          nextTier: "none",
          reason: "invalid_access_token",
        });
        continue;
      }

      results.push({
        ...baseResult,
        action: "failed",
        error: getErrorMessage(error),
        nextTier: patronRecord.tier,
        reason: "patreon_api_error",
      });
      continue;
    }

    if (!membership?.isActive) {
      await deactivatePatron({
        database: db,
        dryRun,
        now,
        patronId: patronRecord.id,
      });
      results.push({
        ...baseResult,
        action: "deactivated",
        nextTier: "none",
        reason: "expired_or_missing_membership",
      });
      continue;
    }

    const patronStatus = await updatePatronFromMembership({
      database: db,
      dryRun,
      membership,
      now,
      patronRecord,
    });

    results.push({
      ...baseResult,
      action: "kept_active",
      nextTier: patronStatus.tier,
      reason: "active_membership_verified",
    });
  }

  return summarizeResults(results, dryRun);
}
