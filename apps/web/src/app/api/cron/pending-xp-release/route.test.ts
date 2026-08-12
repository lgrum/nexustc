// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const release = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("@repo/api/services/integrity", () => ({
  releaseMaturedPendingXpBatch: release,
}));
vi.mock("@repo/db", () => ({ db: { name: "database" } }));
vi.mock("@repo/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-value" },
}));
vi.mock("next/cache", () => ({ revalidateTag }));

const { GET } = await import("./route");

beforeEach(() => {
  release.mockReset().mockResolvedValue({
    checked: 2,
    profileUserIds: ["user-1", "user-2"],
    released: 1,
  });
  revalidateTag.mockReset();
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/pending-xp-release")
  );

  expect(response.status).toBe(401);
  expect(release).not.toHaveBeenCalled();
});

test("releases matured Pending XP and revalidates affected profiles", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/pending-xp-release", {
      headers: { authorization: "Bearer test-cron-secret-value" },
    })
  );

  await expect(response.json()).resolves.toEqual({
    checked: 2,
    profileUserIds: ["user-1", "user-2"],
    released: 1,
  });
  expect(release).toHaveBeenCalledOnce();
  expect(revalidateTag).toHaveBeenCalledWith("profile:user-1", "max");
  expect(revalidateTag).toHaveBeenCalledWith("profile:user-2", "max");
});

test("revalidates committed releases before reporting a batch failure", async () => {
  release.mockRejectedValueOnce(
    Object.assign(new Error("release failure"), {
      profileUserIds: ["released-user"],
    })
  );

  await expect(
    GET(
      new Request("http://localhost/api/cron/pending-xp-release", {
        headers: { authorization: "Bearer test-cron-secret-value" },
      })
    )
  ).rejects.toThrow("release failure");
  expect(revalidateTag).toHaveBeenCalledWith("profile:released-user", "max");
});
