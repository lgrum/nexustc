// @vitest-environment node

import { readFile } from "node:fs/promises";

import { beforeEach, expect, test, vi } from "vitest";

const report = vi.hoisted(() => vi.fn());

vi.mock("@repo/api/services/economy-report", () => ({
  getDailyEconomyReport: report,
}));
vi.mock("@repo/db", () => ({ db: { name: "database" } }));
vi.mock("@repo/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-value" },
}));

const { GET } = await import("./route");

beforeEach(() => {
  report.mockReset().mockResolvedValue({ day: "2026-08-10" });
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/economy-snapshot")
  );

  expect(response.status).toBe(401);
  expect(report).not.toHaveBeenCalled();
});

test("materializes the daily economy snapshot with the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/economy-snapshot", {
      headers: { authorization: "Bearer test-cron-secret-value" },
    })
  );

  await expect(response.json()).resolves.toEqual({ day: "2026-08-10" });
  expect(report).toHaveBeenCalledWith({ name: "database" });
});

test("schedules daily snapshot materialization independently of admin traffic", async () => {
  const config = JSON.parse(
    await readFile(
      new URL("../../../../../vercel.json", import.meta.url),
      "utf-8"
    )
  ) as { crons: { path: string; schedule: string }[] };

  expect(config.crons).toContainEqual({
    path: "/api/cron/economy-snapshot",
    schedule: "10 3 * * *",
  });
});
