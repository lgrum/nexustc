import { and, eq, gt, lte, or } from "@repo/db";
import { patron, post } from "@repo/db/schema/app";
import type { PatronTier } from "@repo/shared/constants";
import {
  buildEarlyAccessSchedule,
  getEarlyAccessView,
} from "@repo/shared/early-access";
import type {
  EarlyAccessSchedule,
  EarlyAccessView,
} from "@repo/shared/early-access";

import type { Context } from "../context";

type Db = Context["db"];
type Session = Context["session"];

type EarlyAccessPostRecord = {
  earlyAccessEnabled: boolean;
  earlyAccessStartedAt: Date | null;
  type: "comic" | "post";
  vip12EarlyAccessHours: number;
  vip8EarlyAccessHours: number;
};

type EarlyAccessUpdateInput = {
  documentStatus: "draft" | "pending" | "publish" | "trash";
  enabled: boolean;
  existingStartedAt?: Date | null;
  now?: Date;
  vip12Hours: number;
  vip8Hours: number;
};

export async function getViewerPatronTier(
  db: Db,
  session: Session
): Promise<PatronTier> {
  if (!session?.user) {
    return "none";
  }

  const patronRecord = await db.query.patron.findFirst({
    columns: { isActivePatron: true, tier: true },
    where: eq(patron.userId, session.user.id),
  });

  if (!patronRecord?.isActivePatron) {
    return "none";
  }

  return patronRecord.tier;
}

export function resolveEarlyAccessStorageFields(
  input: EarlyAccessUpdateInput
): {
  earlyAccessEnabled: boolean;
  earlyAccessPublicAt: Date | null;
  earlyAccessStartedAt: Date | null;
  earlyAccessVip12EndsAt: Date | null;
  vip12EarlyAccessHours: number;
  vip8EarlyAccessHours: number;
} {
  const now = input.now ?? new Date();
  const startedAt = input.enabled
    ? (input.existingStartedAt ??
      (input.documentStatus === "publish" ? now : null))
    : null;
  const schedule = buildEarlyAccessSchedule({
    enabled: input.enabled,
    startedAt,
    vip12Hours: input.vip12Hours,
    vip8Hours: input.vip8Hours,
  });

  return {
    earlyAccessEnabled: input.enabled,
    earlyAccessPublicAt: schedule.publicReleaseAt,
    earlyAccessStartedAt: schedule.startedAt,
    earlyAccessVip12EndsAt: schedule.vip12EndsAt,
    vip12EarlyAccessHours: schedule.vip12Hours,
    vip8EarlyAccessHours: schedule.vip8Hours,
  };
}

export function buildPostEarlyAccessSchedule(
  item: EarlyAccessPostRecord
): EarlyAccessSchedule {
  if (item.type === "comic") {
    return buildEarlyAccessSchedule({
      enabled: false,
      startedAt: null,
      vip12Hours: 0,
      vip8Hours: 0,
    });
  }

  return buildEarlyAccessSchedule({
    enabled: item.earlyAccessEnabled,
    startedAt: item.earlyAccessStartedAt,
    vip12Hours: item.vip12EarlyAccessHours,
    vip8Hours: item.vip8EarlyAccessHours,
  });
}

export function getPostEarlyAccessView(
  item: EarlyAccessPostRecord,
  viewer: { role?: string; tier: PatronTier },
  now = new Date()
): EarlyAccessView {
  return getEarlyAccessView({
    now,
    role: viewer.role,
    schedule: buildPostEarlyAccessSchedule(item),
    viewerTier: viewer.tier,
  });
}

export function publicCatalogVisibilityCondition(now = new Date()) {
  return or(
    eq(post.type, "comic"),
    eq(post.earlyAccessEnabled, false),
    lte(post.earlyAccessPublicAt, now)
  );
}

export function activeVipCatalogCondition(now = new Date()) {
  return and(
    eq(post.type, "post"),
    eq(post.earlyAccessEnabled, true),
    gt(post.earlyAccessPublicAt, now)
  );
}
