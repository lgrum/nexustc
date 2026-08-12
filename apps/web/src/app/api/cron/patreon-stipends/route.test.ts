// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const grant = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());
const testEnv = vi.hoisted(() => ({
  CRON_SECRET: "test-cron-secret-value" as string | undefined,
}));

vi.mock("@repo/api/services/patreon-stipend", () => ({
  grantMonthlyPatreonStipends: grant,
}));
vi.mock("@repo/db", () => ({ db: { name: "database" } }));
vi.mock("@repo/env", () => ({ env: testEnv }));
vi.mock("next/cache", () => ({ revalidateTag }));

const { GET } = await import("./route");

beforeEach(() => {
  testEnv.CRON_SECRET = "test-cron-secret-value";
  grant.mockReset().mockResolvedValue({
    checked: 2,
    granted: 1,
    profileUserIds: ["user-1"],
  });
  revalidateTag.mockReset();
});

test("rejects requests when cron scheduling is not configured", async () => {
  testEnv.CRON_SECRET = undefined;

  const response = await GET(
    new Request("http://localhost/api/cron/patreon-stipends", {
      headers: { authorization: "Bearer undefined" },
    })
  );

  expect(response.status).toBe(401);
  expect(grant).not.toHaveBeenCalled();
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/patreon-stipends")
  );

  expect(response.status).toBe(401);
  expect(grant).not.toHaveBeenCalled();
});

test("runs the recurring stipend batch with the configured bearer secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/patreon-stipends", {
      headers: { authorization: "Bearer test-cron-secret-value" },
    })
  );

  await expect(response.json()).resolves.toEqual({
    checked: 2,
    granted: 1,
    profileUserIds: ["user-1"],
  });
  expect(grant).toHaveBeenCalledOnce();
  expect(revalidateTag).toHaveBeenCalledWith("profile:user-1", "max");
});

test("revalidates successful stipends before reporting a partial batch failure", async () => {
  const error = Object.assign(
    new AggregateError([new Error("stipend failure")], "partial batch failure"),
    { profileUserIds: ["user-1"] }
  );
  grant.mockRejectedValueOnce(error);

  await expect(
    GET(
      new Request("http://localhost/api/cron/patreon-stipends", {
        headers: { authorization: "Bearer test-cron-secret-value" },
      })
    )
  ).rejects.toBe(error);
  expect(revalidateTag).toHaveBeenCalledWith("profile:user-1", "max");
});
