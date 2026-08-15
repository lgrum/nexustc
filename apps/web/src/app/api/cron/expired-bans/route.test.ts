// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const restore = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("@repo/api/services/user-administration", () => ({
  restoreExpiredTemporaryBanRewards: restore,
}));
vi.mock("@repo/db", () => ({ db: { name: "database" } }));
vi.mock("@repo/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-value" },
}));
vi.mock("next/cache", () => ({ revalidateTag }));

const { GET } = await import("./route");

beforeEach(() => {
  restore.mockReset().mockResolvedValue({
    checked: 1,
    profileUserIds: ["author-1"],
    restored: 1,
  });
  revalidateTag.mockReset();
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/expired-bans")
  );

  expect(response.status).toBe(401);
  expect(restore).not.toHaveBeenCalled();
});

test("restores expired bans and revalidates affected profiles", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/expired-bans", {
      headers: { authorization: "Bearer test-cron-secret-value" },
    })
  );

  await expect(response.json()).resolves.toEqual({
    checked: 1,
    profileUserIds: ["author-1"],
    restored: 1,
  });
  expect(restore).toHaveBeenCalledOnce();
  expect(revalidateTag).toHaveBeenCalledWith("profile:author-1", "max");
  expect(revalidateTag).toHaveBeenCalledWith("profiles", "max");
});

test("revalidates committed restorations before reporting a batch failure", async () => {
  restore.mockRejectedValueOnce(
    Object.assign(new Error("restoration failure"), {
      profileUserIds: ["restored-user"],
    })
  );

  await expect(
    GET(
      new Request("http://localhost/api/cron/expired-bans", {
        headers: { authorization: "Bearer test-cron-secret-value" },
      })
    )
  ).rejects.toThrow("restoration failure");
  expect(revalidateTag).toHaveBeenCalledWith("profile:restored-user", "max");
  expect(revalidateTag).toHaveBeenCalledWith("profiles", "max");
});
