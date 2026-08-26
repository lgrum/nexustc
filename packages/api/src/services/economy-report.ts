import { sql } from "@repo/db";
import type { db as database } from "@repo/db";
import { eterisDailySnapshot } from "@repo/db/schema/app";
import { ETERIS_DAILY_REPORT_ADVISORY_LOCK_ID } from "@repo/shared/eteris";

import { getCollectibleRuntimeMetrics } from "./collectibles";

type Database = typeof database;

export type OfficialCardShopEconomyProjection = {
  activeOfferCount: number;
  configuredOfferCount: number;
  eterisBurned: string;
  purchaseCount: number;
  remainingLimitedQuota: number;
  soldPackCount: number;
};

export type GachaponEconomyProjection = {
  activeMachineCount: number;
  activationCount: number;
  configuredMachineCount: number;
  eterisBurned: string;
  issuedPackCount: number;
  remainingGlobalQuota: number;
};

/** Secret-free operational counters used by the collectible admin dashboard. */
export type CollectibleOperationalMetrics = {
  correctionCount: number;
  custodyAgeSeconds: number;
  deadlockRetryCount: number;
  exceptionalGrantCount: number;
  exceptionalTransferCount: number;
  expiryBacklogCount: number;
  failedSettlementCount: number;
  feeReversalCount: number;
  freezeCount: number;
  issuanceLatencySeconds: number;
  listingFeeIssuanceCount: number;
  listingFeeReversalCount: number;
  notificationBacklogCount: number;
  quotaDriftCount: number;
  renderFailureCount: number;
  restoreCount: number;
  revisionExhaustionCount: number;
  salesCount: number;
  supplyExhaustionCount: number;
  walletFailureCount: number;
};

type RawMetrics = {
  anomalous_earners: { total: string; userId: string }[];
  balance_percentiles: { p50: string; p90: string; p99: string };
  burned: string;
  burned_by_reason: Record<string, string>;
  frozen_wallet_count: number;
  issued: string;
  issued_by_reason: Record<string, string>;
  negative_wallet_count: number;
  total_user_supply: string;
};

function ratio(issued: bigint, burned: bigint) {
  if (burned === 0n) {
    return null;
  }
  const scaled = (issued * 10_000n + burned / 2n) / burned;
  return `${scaled / 10_000n}.${(scaled % 10_000n).toString().padStart(4, "0")}`;
}

function serializeSnapshot(snapshot: typeof eterisDailySnapshot.$inferSelect) {
  return {
    anomalousEarners: snapshot.anomalousEarners,
    balancePercentiles: snapshot.balancePercentiles,
    burned: snapshot.burned.toString(),
    burnedByReason: snapshot.sinkTotals,
    createdAt: snapshot.createdAt.toISOString(),
    day: snapshot.day,
    frozenWalletCount: snapshot.frozenWalletCount,
    issued: snapshot.issued.toString(),
    issuedByReason: snapshot.sourceTotals,
    negativeWalletCount: snapshot.negativeWalletCount,
    sourceSinkRatio: ratio(snapshot.issued, snapshot.burned),
    totalUserSupply: snapshot.totalUserSupply.toString(),
  };
}

/**
 * Returns the shop-specific operational slice without changing the stable
 * daily snapshot contract. Disabled and scheduled offers are included in the
 * configured counts so operators can inspect prices and quotas before launch;
 * the sink total is read from the authoritative Eteris purchase journal.
 */
export async function getOfficialCardShopEconomyProjection(
  db: Pick<Database, "execute">,
  reportDate = new Date()
): Promise<OfficialCardShopEconomyProjection> {
  const day = reportDate.toISOString().slice(0, 10);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const result = await db.execute(sql`
    select
      count(*)::int as configured_offer_count,
      count(*) filter (where enabled = true)::int as active_offer_count,
      coalesce(sum(total_sold), 0)::int as sold_pack_count,
      coalesce(sum(remaining_sales) filter (where remaining_sales is not null), 0)::int as remaining_limited_quota,
      coalesce((
        select count(*)::int
        from official_card_shop_purchase
        where created_at >= ${dayStart} and created_at < ${dayEnd}
      ), 0)::int as purchase_count,
      coalesce((
        select sum(total_price)::text
        from official_card_shop_purchase
        where created_at >= ${dayStart} and created_at < ${dayEnd}
      ), '0') as eteris_burned
    from official_card_shop_offer
  `);
  const row = result.rows[0] as
    | {
        active_offer_count?: unknown;
        configured_offer_count?: unknown;
        eteris_burned?: unknown;
        purchase_count?: unknown;
        remaining_limited_quota?: unknown;
        sold_pack_count?: unknown;
      }
    | undefined;
  return {
    activeOfferCount: Number(row?.active_offer_count ?? 0),
    configuredOfferCount: Number(row?.configured_offer_count ?? 0),
    eterisBurned: String(row?.eteris_burned ?? "0"),
    purchaseCount: Number(row?.purchase_count ?? 0),
    remainingLimitedQuota: Number(row?.remaining_limited_quota ?? 0),
    soldPackCount: Number(row?.sold_pack_count ?? 0),
  };
}

/**
 * Returns aggregate machine configuration and activation volume. It never
 * includes users, idempotency keys, Pack Instance identifiers, or hidden
 * outcomes; the Eteris amount is derived from activation records linked to the
 * authoritative journal transaction.
 */
export async function getGachaponEconomyProjection(
  db: Pick<Database, "execute">,
  reportDate = new Date()
): Promise<GachaponEconomyProjection> {
  const day = reportDate.toISOString().slice(0, 10);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const result = await db.execute(sql`
    select
      count(*)::int as configured_machine_count,
      count(*) filter (where state = 'active')::int as active_machine_count,
      coalesce(sum(global_quota - total_activations) filter (
        where global_quota is not null and state in ('active', 'paused')
      ), 0)::int as remaining_global_quota,
      coalesce((
        select count(*)::int
        from gachapon_activation
        where created_at >= ${dayStart} and created_at < ${dayEnd}
      ), 0)::int as activation_count,
      coalesce((
        select count(*)::int
        from gachapon_activation
        where created_at >= ${dayStart} and created_at < ${dayEnd}
      ), 0)::int as issued_pack_count,
      coalesce((
        select sum(a.charged_cost)::text
        from gachapon_activation a
        inner join eteris_transaction t on t.id = a.eteris_transaction_id
        where t.kind = 'gacha'
          and t.created_at >= ${dayStart} and t.created_at < ${dayEnd}
      ), '0') as eteris_burned
    from gachapon_machine
  `);
  const row = result.rows[0] as
    | {
        active_machine_count?: unknown;
        activation_count?: unknown;
        configured_machine_count?: unknown;
        eteris_burned?: unknown;
        issued_pack_count?: unknown;
        remaining_global_quota?: unknown;
      }
    | undefined;
  return {
    activeMachineCount: Number(row?.active_machine_count ?? 0),
    activationCount: Number(row?.activation_count ?? 0),
    configuredMachineCount: Number(row?.configured_machine_count ?? 0),
    eterisBurned: String(row?.eteris_burned ?? "0"),
    issuedPackCount: Number(row?.issued_pack_count ?? 0),
    remainingGlobalQuota: Number(row?.remaining_global_quota ?? 0),
  };
}

/**
 * Operational metrics intentionally contain only aggregate counters. No
 * actor, asset, pack, Eteris, or unopened-result identity crosses this
 * boundary. Notification backlog is measured from committed acquisition rows
 * whose post-commit dedupe record is absent, so a delivery failure remains
 * visible and retryable without exposing private asset identities.
 */
export async function getCollectibleOperationalMetrics(
  db: Pick<Database, "execute">,
  now = new Date()
): Promise<CollectibleOperationalMetrics> {
  const result = await db.execute(sql`
    select
      count(*) filter (where action = 'freeze')::int as freeze_count,
      count(*) filter (where action = 'restore')::int as restore_count,
      count(*) filter (where action in ('correct', 'exceptional-transfer'))::int as correction_count,
      count(*) filter (where action = 'exceptional-grant')::int as exceptional_grant_count,
      count(*) filter (where action = 'exceptional-transfer')::int as exceptional_transfer_count,
      count(*) filter (where action = 'reverse-eteris')::int as fee_reversal_count,
      (select count(*)::int from pack_revision where availability = 'exhausted') as revision_exhaustion_count,
      (select count(*)::int from official_card_shop_offer where remaining_sales is not null and remaining_sales < 0) as quota_drift_count,
      coalesce((select extract(epoch from ${now} - min(created_at))::int from collectible_custody where released_at is null), 0)::int as custody_age_seconds,
      (select count(*)::int from black_market_listing where state = 'active' and expires_at <= ${now}) as failed_settlement_count,
      (select count(*)::int from trade_offer where state = 'sent' and expires_at <= ${now})
        + (select count(*)::int from gift_offer where state = 'sent' and expires_at <= ${now}) as expiry_backlog_count,
      (
        select count(*)::int
        from pack_opening opening
        where opening.owner_user_id is not null
          and not exists (
          select 1 from notification n
          where n.dedupe_key = 'collectible-pack-open:' || opening.id
        )
      )
        + (
          select count(*)::int
          from official_card_shop_purchase purchase
          where purchase.buyer_user_id is not null
            and not exists (
            select 1 from notification n
            where n.dedupe_key = 'card-shop-purchase:' || purchase.id
          )
        )
        + (
          select count(*)::int
          from gachapon_activation activation
          where activation.user_id is not null
            and not exists (
            select 1 from notification n
            where n.dedupe_key = 'gachapon-activation:' || activation.id
          )
        )
        + (
          select count(*)::int
          from collectible_grant_execution grant_execution
          where grant_execution.recipient_user_id is not null
            and not exists (
            select 1 from notification n
            where n.dedupe_key = 'collectible-grant:' || grant_execution.id
          )
        ) as notification_backlog_count,
      coalesce((
        select extract(epoch from avg(opened_at - issued_at))::int
        from pack_instance
        where opened_at is not null
      ), 0)::int as issuance_latency_seconds,
      (
        select count(*)::int
        from card_template
        where lifecycle = 'active'
          and lifetime_supply_ceiling is not null
          and minted_supply >= lifetime_supply_ceiling
      ) + (
        select count(*)::int from pack_revision where availability = 'exhausted'
      ) as supply_exhaustion_count,
      (select count(*)::int from eteris_wallet_reconciliation where repaired = false and ledger_balance <> projection_balance) as wallet_failure_count,
      (select count(*)::int from black_market_listing where fee_transaction_id is not null) as listing_fee_issuance_count,
      (select count(*)::int from black_market_listing where fee_reversal_transaction_id is not null) as listing_fee_reversal_count,
      (select count(*)::int from black_market_sale) as sales_count,
      (select count(*)::int from card_template where lifecycle = 'active' and jsonb_array_length(rendered_variants) = 0) as render_failure_count
    from collectible_admin_action
  `);
  const row = result.rows[0] as
    | {
        correction_count?: unknown;
        custody_age_seconds?: unknown;
        issuance_latency_seconds?: unknown;
        listing_fee_issuance_count?: unknown;
        listing_fee_reversal_count?: unknown;
        sales_count?: unknown;
        supply_exhaustion_count?: unknown;
        wallet_failure_count?: unknown;
        exceptional_grant_count?: unknown;
        exceptional_transfer_count?: unknown;
        expiry_backlog_count?: unknown;
        failed_settlement_count?: unknown;
        fee_reversal_count?: unknown;
        freeze_count?: unknown;
        notification_backlog_count?: unknown;
        quota_drift_count?: unknown;
        render_failure_count?: unknown;
        restore_count?: unknown;
        revision_exhaustion_count?: unknown;
      }
    | undefined;
  return {
    correctionCount: Number(row?.correction_count ?? 0),
    custodyAgeSeconds: Number(row?.custody_age_seconds ?? 0),
    deadlockRetryCount: getCollectibleRuntimeMetrics().deadlockRetryCount,
    exceptionalGrantCount: Number(row?.exceptional_grant_count ?? 0),
    exceptionalTransferCount: Number(row?.exceptional_transfer_count ?? 0),
    expiryBacklogCount: Number(row?.expiry_backlog_count ?? 0),
    failedSettlementCount: Number(row?.failed_settlement_count ?? 0),
    feeReversalCount: Number(row?.fee_reversal_count ?? 0),
    freezeCount: Number(row?.freeze_count ?? 0),
    issuanceLatencySeconds: Number(row?.issuance_latency_seconds ?? 0),
    listingFeeIssuanceCount: Number(row?.listing_fee_issuance_count ?? 0),
    listingFeeReversalCount: Number(row?.listing_fee_reversal_count ?? 0),
    notificationBacklogCount: Number(row?.notification_backlog_count ?? 0),
    quotaDriftCount: Number(row?.quota_drift_count ?? 0),
    renderFailureCount: Number(row?.render_failure_count ?? 0),
    restoreCount: Number(row?.restore_count ?? 0),
    revisionExhaustionCount: Number(row?.revision_exhaustion_count ?? 0),
    salesCount: Number(row?.sales_count ?? 0),
    supplyExhaustionCount: Number(row?.supply_exhaustion_count ?? 0),
    walletFailureCount: Number(row?.wallet_failure_count ?? 0),
  };
}

export function getDailyEconomyReport(
  db: Database,
  reportDate = new Date(),
  generatedAt = new Date()
) {
  const day = reportDate.toISOString().slice(0, 10);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ETERIS_DAILY_REPORT_ADVISORY_LOCK_ID})`
    );
    const result = await tx.execute(sql`
      with wallets_at_cutoff as (
        select
          w.id,
          w.kind,
          w.user_id,
          w.anonymized_at,
          coalesce((
            select p.balance_after
            from eteris_posting p
            inner join eteris_transaction t on t.id = p.transaction_id
            where p.wallet_id = w.id and t.created_at < ${dayEnd}
            order by t.sequence desc
            limit 1
          ), 0) as balance,
          coalesce((
            select history.status
            from eteris_wallet_status_event history
            where history.wallet_id = w.id and history.created_at < ${dayEnd}
            order by history.created_at desc, history.sequence desc
            limit 1
          ), 'active'::eteris_wallet_status) as status
        from eteris_wallet w
        where w.created_at < ${dayEnd}
      ),
      user_wallets as (
        select id, user_id, status, balance
        from wallets_at_cutoff
        where kind = 'user'
          and (user_id is not null or anonymized_at >= ${dayEnd})
      ),
      daily_user_postings as (
        select w.user_id, t.kind::text as reason, t.metadata, p.amount
        from eteris_posting p
        inner join eteris_wallet w on w.id = p.wallet_id
        inner join eteris_transaction t on t.id = p.transaction_id
        where w.kind = 'user'
          and t.created_at >= ${dayStart}
          and t.created_at < ${dayEnd}
      ),
      daily_transaction_flows as (
        select
          t.id,
          t.kind::text as reason,
          coalesce(sum(p.amount) filter (where w.kind = 'user'), 0) as user_delta
        from eteris_transaction t
        inner join eteris_posting p on p.transaction_id = t.id
        inner join eteris_wallet w on w.id = p.wallet_id
        where t.created_at >= ${dayStart}
          and t.created_at < ${dayEnd}
        group by t.id, t.kind
      ),
      sources as (
        select reason, sum(user_delta) as total
        from daily_transaction_flows
        where user_delta > 0
        group by reason
      ),
      sinks as (
        select reason, -sum(user_delta) as total
        from daily_transaction_flows
        where user_delta < 0
        group by reason
      ),
      earners as (
        select p.user_id, sum(p.amount) as total
        from daily_user_postings p
        where p.amount > 0
          and p.user_id is not null
          and (
            exists (
              select 1
              from xp_risk_signal s
              where s.user_id = p.user_id
                and s.kind in ('source_cap_pressure', 'wallet_credit_velocity', 'xp_velocity')
                and s.occurred_at >= ${dayStart}
                and s.occurred_at < ${dayEnd}
            )
            or exists (
              select 1
              from xp_event e
              inner join xp_integrity_case c on c.id = e.integrity_case_id
              cross join lateral jsonb_array_elements(
                coalesce(c.evidence -> 'signals', '[]'::jsonb)
              ) signal
              where e.id = p.metadata ->> 'xpEventId'
                and signal ->> 'kind' in ('source_cap_pressure', 'wallet_credit_velocity', 'xp_velocity')
            )
          )
        group by p.user_id
        order by total desc, user_id
        limit 10
      )
      select
        coalesce((select sum(balance)::text from user_wallets), '0') as total_user_supply,
        coalesce((select sum(total)::text from sources), '0') as issued,
        coalesce((select sum(total)::text from sinks), '0') as burned,
        (select count(*)::int from user_wallets where balance < 0) as negative_wallet_count,
        (select count(*)::int from wallets_at_cutoff where status = 'frozen') as frozen_wallet_count,
        coalesce(
          (select jsonb_object_agg(reason, total::text) from sources),
          '{}'::jsonb
        ) as issued_by_reason,
        coalesce(
          (select jsonb_object_agg(reason, total::text) from sinks),
          '{}'::jsonb
        ) as burned_by_reason,
        jsonb_build_object(
          'p50', coalesce((select percentile_disc(0.5) within group (order by balance)::text from user_wallets), '0'),
          'p90', coalesce((select percentile_disc(0.9) within group (order by balance)::text from user_wallets), '0'),
          'p99', coalesce((select percentile_disc(0.99) within group (order by balance)::text from user_wallets), '0')
        ) as balance_percentiles,
        coalesce(
          (select jsonb_agg(jsonb_build_object('userId', user_id, 'total', total::text) order by total desc, user_id) from earners),
          '[]'::jsonb
        ) as anomalous_earners
    `);
    const metrics = result.rows[0] as RawMetrics | undefined;
    if (!metrics) {
      throw new Error("No se pudo generar el informe diario de Eteris.");
    }
    const snapshot = {
      anomalousEarners: metrics.anomalous_earners,
      balancePercentiles: metrics.balance_percentiles,
      burned: BigInt(metrics.burned),
      createdAt: generatedAt,
      day,
      frozenWalletCount: metrics.frozen_wallet_count,
      issued: BigInt(metrics.issued),
      negativeWalletCount: metrics.negative_wallet_count,
      sinkTotals: metrics.burned_by_reason,
      sourceTotals: metrics.issued_by_reason,
      totalUserSupply: BigInt(metrics.total_user_supply),
    } satisfies typeof eterisDailySnapshot.$inferSelect;
    await tx.insert(eterisDailySnapshot).values(snapshot).onConflictDoUpdate({
      set: snapshot,
      target: eterisDailySnapshot.day,
    });
    return serializeSnapshot(snapshot);
  });
}
