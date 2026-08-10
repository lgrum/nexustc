import { sql } from "@repo/db";
import type { db as database } from "@repo/db";
import { eterisDailySnapshot } from "@repo/db/schema/app";
import { ETERIS_DAILY_REPORT_ADVISORY_LOCK_ID } from "@repo/shared/eteris";

type Database = typeof database;

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

export function getDailyEconomyReport(db: Database, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ETERIS_DAILY_REPORT_ADVISORY_LOCK_ID})`
    );
    const result = await tx.execute(sql`
      with user_wallets as (
        select w.id, w.user_id, w.status, b.balance
        from eteris_wallet w
        inner join eteris_wallet_balance b on b.wallet_id = w.id
        where w.kind = 'user' and w.user_id is not null
      ),
      daily_user_postings as (
        select w.user_id, t.kind::text as reason, p.amount
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
          and exists (
            select 1
            from xp_risk_signal s
            where s.user_id = p.user_id
              and s.kind in ('source_cap_pressure', 'wallet_credit_velocity', 'xp_velocity')
              and s.occurred_at >= ${dayStart}
              and s.occurred_at < ${dayEnd}
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
        (select count(*)::int from eteris_wallet where status = 'frozen') as frozen_wallet_count,
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
      createdAt: now,
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
