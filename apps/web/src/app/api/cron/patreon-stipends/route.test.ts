// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const grant = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("@repo/api/services/patreon-stipend", () => ({
  grantMonthlyPatreonStipends: grant,
}));
vi.mock("@repo/db", () => ({ db: { name: "database" } }));
vi.mock("@repo/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-value" },
}));
vi.mock("next/cache", () => ({ revalidateTag }));

const { GET } = await import("./route");

beforeEach(() => {
  grant.mockReset().mockResolvedValue({
    checked: 2,
    granted: 1,
    profileUserIds: ["user-1"],
  });
  revalidateTag.mockReset();
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
