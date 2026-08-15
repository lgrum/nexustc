import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("account closure removes every personal integrity evidence table", async () => {
  const source = await readFile(
    new URL("account-closure.ts", import.meta.url),
    "utf-8"
  );
  const compactSource = source.replaceAll(/\s+/g, "");

  for (const table of [
    "streakDiscoveryReceipt",
    "userStreak",
    "xpLikeDisqualification",
    "xpRiskSignal",
    "xpIntegrityCase",
  ]) {
    expect(compactSource).toContain(`tx.delete(${table})`);
  }
  expect(
    compactSource.indexOf("tx.delete(xpLikeDisqualification)")
  ).toBeLessThan(compactSource.indexOf("tx.delete(xpIntegrityCase)"));
  const reversalDelete = compactSource.indexOf(
    "not(isNull(xpEvent.reversesEventId))"
  );
  expect(reversalDelete).toBeGreaterThan(-1);
  expect(reversalDelete).toBeLessThan(
    compactSource.lastIndexOf("tx.delete(xpEvent)")
  );
  const streakLock = compactSource.indexOf(
    '.from(userStreak).where(eq(userStreak.userId,userId)).for("update")'
  );
  const progressionLock = compactSource.indexOf(
    '.from(userProgression).where(eq(userProgression.userId,userId)).for("update")'
  );
  expect(streakLock).toBeGreaterThan(-1);
  expect(streakLock).toBeLessThan(progressionLock);
  const reportLock = compactSource.indexOf("pg_advisory_xact_lock");
  const snapshotRead = compactSource.indexOf(
    ".from(eterisDailySnapshot).where("
  );
  expect(compactSource).toContain("ETERIS_DAILY_REPORT_ADVISORY_LOCK_ID");
  expect(reportLock).toBeGreaterThan(-1);
  expect(reportLock).toBeLessThan(snapshotRead);
});

test("account closure anonymizes catalog audits before cascading personal customization", async () => {
  const source = await readFile(
    new URL("account-closure.ts", import.meta.url),
    "utf-8"
  );
  const compactSource = source.replaceAll(/\s+/g, "");

  const auditCleanup = compactSource.indexOf(
    "tx.update(profileCatalogAudit).set("
  );
  const userDeletion = compactSource.indexOf(
    "tx.delete(user).where(eq(user.id,userId))"
  );
  expect(auditCleanup).toBeGreaterThan(-1);
  expect(compactSource).toContain("profileCatalogAudit.before}-'userId'");
  expect(compactSource).toContain("profileCatalogAudit.after}-'userId'");
  expect(compactSource).toContain("grantedByUserId");
  expect(compactSource).toContain("revokedByUserId");
  const catalogMediaTransfer = compactSource.indexOf(
    "tx.update(profileMediaAsset).set({ownerUserId:null})"
  );
  expect(catalogMediaTransfer).toBeGreaterThan(-1);
  expect(catalogMediaTransfer).toBeLessThan(userDeletion);
  expect(compactSource).toContain("exists(tx.select(");
  expect(compactSource).toContain(
    "profileCatalogDecorationRevision.mediaAssetId"
  );
  expect(compactSource).toContain("profileRoleDefinition.iconAssetId");
  expect(compactSource).toContain("profileRoleDefinition.overlayAssetId");
  expect(compactSource).toContain("profileEmblemDefinition.iconAssetId");
  expect(auditCleanup).toBeLessThan(userDeletion);
});
