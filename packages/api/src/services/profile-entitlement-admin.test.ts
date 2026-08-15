import {
  ProfileEntitlementAdminError,
  publishProfileLayoutRequirement,
  publishProfileShowcaseRequirement,
} from "./profile-entitlement-admin";

function createTransactionDb(tx: Record<string, unknown>) {
  return {
    transaction: vi.fn((callback) => callback(tx)),
  } as never;
}

function createSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function createUpdateChain(result: unknown[]) {
  const chain = {
    returning: vi.fn().mockResolvedValue(result),
    set: vi.fn(),
    where: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

it("rejects gating the protected Stack layout", async () => {
  const select = vi.fn().mockReturnValue(
    createSelectChain([
      {
        catalogOrder: 0,
        createdByUserId: "owner-1",
        description: "Predeterminado",
        eterisPrice: null,
        isFree: true,
        isProtectedDefault: true,
        itemId: "profile-layout-stack",
        name: "Pila",
        revision: 1,
        revisionId: "revision-1",
      },
    ])
  );
  const insert = vi.fn();
  const db = createTransactionDb({ insert, select });

  await expect(
    publishProfileLayoutRequirement(db, {
      actorUserId: "owner-1",
      expectedRevision: 1,
      key: "stack",
      reason: "Prueba de requisito",
      requiredTier: "level1",
    })
  ).rejects.toThrow(ProfileEntitlementAdminError);
  expect(insert).not.toHaveBeenCalled();
});

it("publishes a Showcase requirement with optimistic revision and audit reason", async () => {
  const updateChain = createUpdateChain([{ key: "xp" }]);
  const auditValues = vi.fn().mockResolvedValue(null);
  const tx = {
    insert: vi.fn().mockReturnValue({ values: auditValues }),
    query: {
      profileShowcaseType: {
        findFirst: vi.fn().mockResolvedValue({
          isActive: true,
          key: "xp",
          publishedConfigRevision: 2,
          requiredTier: "none",
        }),
      },
    },
    update: vi.fn().mockReturnValue(updateChain),
  };

  await expect(
    publishProfileShowcaseRequirement(createTransactionDb(tx), {
      actorUserId: "owner-1",
      expectedRevision: 2,
      key: "xp",
      reason: "Ajuste comercial aprobado",
      requiredTier: "level1",
    })
  ).resolves.toEqual({
    key: "xp",
    publishedConfigRevision: 3,
    requiredTier: "level1",
  });
  expect(updateChain.returning).toHaveBeenCalledOnce();
  expect(auditValues).toHaveBeenCalledWith(
    expect.objectContaining({ note: "Ajuste comercial aprobado" })
  );
});

it("rejects a stale Showcase requirement revision before writing", async () => {
  const update = vi.fn();
  const db = createTransactionDb({
    query: {
      profileShowcaseType: {
        findFirst: vi.fn().mockResolvedValue({
          publishedConfigRevision: 3,
          requiredTier: "none",
        }),
      },
    },
    update,
  });

  await expect(
    publishProfileShowcaseRequirement(db, {
      actorUserId: "owner-1",
      expectedRevision: 2,
      key: "reviews",
      reason: "Cambio confirmado",
      requiredTier: "level1",
    })
  ).rejects.toThrow("Recarga antes de publicar");
  expect(update).not.toHaveBeenCalled();
});
