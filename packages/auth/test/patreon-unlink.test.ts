import { expect, it, vi } from "vitest";

import { deactivatePatreonMembershipAfterAccountDelete } from "../src/patreon-sync";

const mocks = vi.hoisted(() => ({
  active: true,
}));

vi.mock("@repo/db", () => ({
  db: {
    update: () => ({
      set: ({ isActivePatron }: { isActivePatron: boolean }) => {
        mocks.active = isActivePatron;
        return { where: vi.fn().mockResolvedValue() };
      },
    }),
  },
  eq: vi.fn(() => "user-match"),
}));
vi.mock("@repo/db/schema/app", () => ({ patron: { userId: {} } }));

it("removes authoritative Patreon entitlement after unlink", async () => {
  mocks.active = true;

  await deactivatePatreonMembershipAfterAccountDelete({
    providerId: "credential",
    userId: "user-1",
  });
  expect(mocks.active).toBe(true);

  await deactivatePatreonMembershipAfterAccountDelete({
    providerId: "patreon",
    userId: "user-1",
  });

  expect(mocks.active).toBe(false);
});
