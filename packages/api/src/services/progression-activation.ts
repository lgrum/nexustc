import { desc, eq } from "@repo/db";
import type { db as database } from "@repo/db";
import { progressionSystem, userProgression } from "@repo/db/schema/app";
import {
  ACCOUNT_LEVEL_CURVES,
  ACCOUNT_LEVEL_CURVE_VERSION,
  ACCOUNT_LEVEL_THRESHOLDS,
  assertCompatibleAccountLevelThresholds,
} from "@repo/shared/progression";

type ActivationExecutor = Pick<typeof database, "insert" | "select" | "update">;
type ActivationReader = Pick<typeof database, "select">;

export async function readProgressionActivationDate(
  executor: ActivationReader
) {
  const [system] = await executor
    .select({ activatedAt: progressionSystem.activatedAt })
    .from(progressionSystem)
    .where(eq(progressionSystem.id, "account-progression"))
    .limit(1);
  return system?.activatedAt ?? null;
}

export async function ensureProgressionActivationInTransaction(
  executor: ActivationExecutor,
  now: Date
) {
  await executor
    .insert(progressionSystem)
    .values({
      activatedAt: now,
      curveVersion: ACCOUNT_LEVEL_CURVE_VERSION,
      id: "account-progression",
      updatedAt: now,
    })
    .onConflictDoNothing({ target: progressionSystem.id });
  const [system] = await executor
    .select({
      activatedAt: progressionSystem.activatedAt,
      curveVersion: progressionSystem.curveVersion,
    })
    .from(progressionSystem)
    .where(eq(progressionSystem.id, "account-progression"))
    .for("update");
  if (!system?.activatedAt) {
    throw new Error("No se pudo activar Account XP.");
  }
  if (system.curveVersion !== ACCOUNT_LEVEL_CURVE_VERSION) {
    const previous = ACCOUNT_LEVEL_CURVES[system.curveVersion];
    if (!previous) {
      throw new Error(
        `No se conserva la curva ${system.curveVersion} para validar compatibilidad.`
      );
    }
    const [highest] = await executor
      .select({ level: userProgression.level })
      .from(userProgression)
      .orderBy(desc(userProgression.level))
      .limit(1);
    assertCompatibleAccountLevelThresholds(
      previous,
      ACCOUNT_LEVEL_THRESHOLDS,
      highest?.level ?? 1
    );
    await executor
      .update(progressionSystem)
      .set({ curveVersion: ACCOUNT_LEVEL_CURVE_VERSION, updatedAt: now })
      .where(eq(progressionSystem.id, "account-progression"));
  }
  return system.activatedAt;
}
