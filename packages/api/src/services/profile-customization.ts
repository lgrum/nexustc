import { and, eq, inArray, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  profileCustomization,
  eterisWallet,
  profileCatalogDecorationRevision,
  profileCatalogItem,
  profileCatalogItemRevision,
  profileCatalogLayoutRevision,
  profileCatalogOwnership,
  profileEquippedDecoration,
  profileSettings,
  profileShowcaseConfig,
  profileShowcaseType,
  patron,
  user,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import {
  favoriteGamesShowcasePayloadSchema,
  PROFILE_DEFAULT_LAYOUT_KEY,
  PROFILE_DEFAULT_SKIN_KEY,
  EMPTY_PROFILE_DECORATIONS,
  PROFILE_DECORATION_SLOTS,
  PROFILE_LAYOUT_REGISTRY,
  profileCustomizationDraftSchema,
} from "@repo/shared/profile-customization";
import type {
  ProfileCustomizationDraft,
  ProfileLayoutCatalogEntry,
  ProfileShowcaseTypeKey,
  ProfileShowcaseVariant,
} from "@repo/shared/profile-customization";

import { setPublicWalletBalanceInTransaction } from "./eteris";
import {
  resolveCurrentProfileDefaults as resolveManifestDefaults,
  resolveVirtualDefaultProfileConfiguration as resolveVirtualManifestDefaults,
} from "./profile-customization-manifest";
import { listPublishedProfileDecorations } from "./profile-decoration-catalog";
import {
  resolveEffectiveProfileConfiguration,
  resolveProfileEntitlements,
  satisfiesProfileVipRequirement,
} from "./profile-entitlements";
import {
  loadFavoriteGamesEntitlement,
  loadPublicGameProjections,
} from "./profile-favorite-games";
import {
  migrateFavoriteGamesPayload,
  PROFILE_SHOWCASE_REGISTRY,
} from "./profile-showcase-registry";
import { listPublishedProfileSkins } from "./profile-skin-catalog";

export class ProfileCustomizationError extends Error {
  readonly code: "CONFLICT" | "IMPERSONATION" | "INVALID_DRAFT";
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: "CONFLICT" | "IMPERSONATION" | "INVALID_DRAFT",
    message: string,
    fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = "ProfileCustomizationError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

type Database = typeof database;
type ReadDatabase = Pick<Database, "query" | "select">;

export { PROFILE_LAYOUT_REGISTRY };

const LAYOUT_BY_ITEM_ID = new Map<
  string,
  (typeof PROFILE_LAYOUT_REGISTRY)[number]
>(PROFILE_LAYOUT_REGISTRY.map((layout) => [layout.itemId, layout]));
const LAYOUT_BY_KEY = new Map(
  PROFILE_LAYOUT_REGISTRY.map((layout) => [layout.key, layout])
);

export async function canRenderPublicProfileShowcase(
  db: ReadDatabase,
  userId: string,
  type: ProfileShowcaseTypeKey
) {
  const [root, row, requirement, account, membership] = await Promise.all([
    db.query.profileCustomization.findFirst({
      columns: { userId: true },
      where: eq(profileCustomization.userId, userId),
    }),
    db.query.profileShowcaseConfig.findFirst({
      columns: { enabled: true },
      where: and(
        eq(profileShowcaseConfig.userId, userId),
        eq(profileShowcaseConfig.typeKey, type)
      ),
    }),
    db.query.profileShowcaseType.findFirst({
      columns: { isActive: true, requiredTier: true },
      where: eq(profileShowcaseType.key, type),
    }),
    db.query.user.findFirst({
      columns: { role: true },
      where: eq(user.id, userId),
    }),
    db.query.patron.findFirst({
      columns: { isActivePatron: true, tier: true },
      where: eq(patron.userId, userId),
    }),
  ]);

  if (!account || (root && !row?.enabled) || requirement?.isActive === false) {
    return false;
  }

  return satisfiesProfileVipRequirement(requirement?.requiredTier ?? "none", {
    isActivePatron: membership?.isActivePatron ?? false,
    role: account.role,
    tier: membership?.tier ?? "none",
  });
}

export function prepareProfileCustomizationSave(input: unknown) {
  const parsed = profileCustomizationDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProfileCustomizationError(
      "INVALID_DRAFT",
      "La configuración del perfil no es válida.",
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ])
      )
    );
  }
  if (!LAYOUT_BY_KEY.has(parsed.data.layoutKey)) {
    throw new ProfileCustomizationError(
      "INVALID_DRAFT",
      "La presentación elegida todavía no está disponible.",
      { layoutKey: "Presentación no disponible." }
    );
  }

  const registered = new Map(
    PROFILE_SHOWCASE_REGISTRY.map((definition) => [definition.key, definition])
  );
  const seenTypes = new Set<string>();
  const seenInstances = new Set<string>();
  const seenOrders = new Set<number>();
  const showcases = parsed.data.showcases.map((showcase) => {
    const definition = registered.get(showcase.type as ProfileShowcaseTypeKey);
    if (!definition) {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        `El Showcase ${showcase.type} no está disponible.`,
        { [`showcases.${showcase.type}`]: "Showcase no disponible." }
      );
    }
    if (seenTypes.has(showcase.type)) {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        "Cada Showcase puede aparecer una sola vez.",
        { showcases: "Hay tipos de Showcase duplicados." }
      );
    }
    if (
      seenInstances.has(showcase.instanceId) ||
      seenOrders.has(showcase.order)
    ) {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        "Las instancias y posiciones deben ser únicas.",
        { showcases: "Hay instancias o posiciones duplicadas." }
      );
    }
    if (
      !(
        definition.supportedVariants as readonly ProfileShowcaseVariant[]
      ).includes(showcase.variant)
    ) {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        "La variante elegida no está disponible.",
        { [`showcases.${showcase.type}.variant`]: "Variante no disponible." }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = definition.migratePayload(
        showcase.payloadSchemaVersion,
        showcase.payload
      );
    } catch {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        "No pudimos actualizar los datos de este Showcase.",
        { [`showcases.${showcase.type}.payload`]: "Datos incompatibles." }
      );
    }
    seenTypes.add(showcase.type);
    seenInstances.add(showcase.instanceId);
    seenOrders.add(showcase.order);
    return {
      ...showcase,
      payload,
      payloadSchemaVersion: definition.payloadSchemaVersion,
    };
  });

  if (
    showcases.length !== PROFILE_SHOWCASE_REGISTRY.length ||
    showcases.some((showcase, index) => showcase.order !== index)
  ) {
    throw new ProfileCustomizationError(
      "INVALID_DRAFT",
      "La configuración debe incluir todos los Showcases en orden continuo.",
      { showcases: "La configuración está incompleta o fuera de orden." }
    );
  }

  const configuration = { ...parsed.data, showcases };
  return {
    configuration,
    visibility: {
      eteris: showcases.find(({ type }) => type === "eteris")!.enabled,
      favorites: showcases.find(({ type }) => type === "library")!.enabled,
      reviews: showcases.find(({ type }) => type === "reviews")!.enabled,
      streak: showcases.find(({ type }) => type === "streak")!.enabled,
    },
  };
}

export async function loadProfileCustomizationEditorState(
  db: Database,
  userId: string,
  rawVisibility?: unknown
) {
  const [
    root,
    rows,
    settings,
    wallet,
    rawSkins,
    rawDecorations,
    equipped,
    account,
    membership,
    ownerships,
    catalogItems,
    rawLayouts,
    showcaseTypes,
  ] = await Promise.all([
    db.query.profileCustomization.findFirst({
      where: eq(profileCustomization.userId, userId),
    }),
    db.query.profileShowcaseConfig.findMany({
      where: eq(profileShowcaseConfig.userId, userId),
    }),
    rawVisibility === undefined
      ? db.query.profileSettings.findFirst({
          columns: { visibilityConfig: true },
          where: eq(profileSettings.userId, userId),
        })
      : undefined,
    db.query.eterisWallet.findFirst({
      columns: { publicBalance: true },
      where: eq(eterisWallet.userId, userId),
    }),
    listPublishedProfileSkins(db),
    listPublishedProfileDecorations(db),
    db.query.profileEquippedDecoration.findMany({
      where: eq(profileEquippedDecoration.userId, userId),
    }),
    db.query.user.findFirst({
      columns: { role: true },
      where: eq(user.id, userId),
    }),
    db.query.patron.findFirst({
      columns: { isActivePatron: true, tier: true },
      where: eq(patron.userId, userId),
    }),
    db.query.profileCatalogOwnership.findMany({
      columns: { catalogItemId: true },
      where: and(
        eq(profileCatalogOwnership.userId, userId),
        sql`${profileCatalogOwnership.revokedAt} IS NULL`
      ),
    }),
    db
      .select({
        id: profileCatalogItem.id,
        isFree: profileCatalogItemRevision.isFree,
        lifecycle: profileCatalogItem.lifecycle,
        requiredTier: profileCatalogItemRevision.requiredTier,
        stableKey: profileCatalogItem.stableKey,
      })
      .from(profileCatalogItem)
      .innerJoin(
        profileCatalogItemRevision,
        eq(
          profileCatalogItem.currentPublishedRevisionId,
          profileCatalogItemRevision.id
        )
      ),
    db
      .select({
        description: profileCatalogItemRevision.description,
        eterisPrice: profileCatalogItemRevision.eterisPrice,
        isFree: profileCatalogItemRevision.isFree,
        itemId: profileCatalogItem.id,
        key: profileCatalogLayoutRevision.rendererKey,
        lifecycle: profileCatalogItem.lifecycle,
        name: profileCatalogItemRevision.name,
        revision: profileCatalogItemRevision.revision,
        requiredTier: profileCatalogItemRevision.requiredTier,
      })
      .from(profileCatalogItem)
      .innerJoin(
        profileCatalogItemRevision,
        eq(
          profileCatalogItem.currentPublishedRevisionId,
          profileCatalogItemRevision.id
        )
      )
      .innerJoin(
        profileCatalogLayoutRevision,
        eq(
          profileCatalogLayoutRevision.revisionId,
          profileCatalogItemRevision.id
        )
      )
      .where(eq(profileCatalogItem.kind, "layout")),
    db.query.profileShowcaseType.findMany(),
  ]);
  const entitlementContext = {
    isActivePatron: membership?.isActivePatron ?? false,
    items: catalogItems,
    ownedItemIds: ownerships.map(({ catalogItemId }) => catalogItemId),
    role: account?.role ?? "user",
    tier: membership?.tier ?? ("none" as const),
  };
  const itemEntitlements = resolveProfileEntitlements(entitlementContext).items;
  const ownedItemIds = new Set(
    ownerships.map(({ catalogItemId }) => catalogItemId)
  );
  const skins = rawSkins.map((entry) => ({
    ...entry,
    entitled: itemEntitlements[entry.itemId]?.entitled ?? false,
    permanentlyOwned: ownedItemIds.has(entry.itemId),
    selectable: itemEntitlements[entry.itemId]?.selectable ?? false,
  }));
  const decorations = rawDecorations.map((entry) => ({
    ...entry,
    entitled: itemEntitlements[entry.itemId]?.entitled ?? false,
    permanentlyOwned: ownedItemIds.has(entry.itemId),
    selectable: itemEntitlements[entry.itemId]?.selectable ?? false,
  }));
  const layouts = rawLayouts.map((entry) => ({
    ...entry,
    entitled: itemEntitlements[entry.itemId]?.entitled ?? false,
    permanentlyOwned: ownedItemIds.has(entry.itemId),
    selectable: itemEntitlements[entry.itemId]?.selectable ?? false,
  })) satisfies ProfileLayoutCatalogEntry[];
  const showcaseEntitlements = Object.fromEntries(
    PROFILE_SHOWCASE_REGISTRY.map(({ key }) => {
      const row = showcaseTypes.find((entry) => entry.key === key);
      const requiredTier = row?.requiredTier ?? "none";
      return [
        key,
        {
          entitled:
            (row?.isActive ?? true) &&
            satisfiesProfileVipRequirement(requiredTier, entitlementContext),
          requiredTier,
        },
      ];
    })
  );
  const selectedSkinItem = root
    ? await db.query.profileCatalogItem.findFirst({
        columns: { stableKey: true },
        where: eq(profileCatalogItem.id, root.selectedSkinItemId),
      })
    : null;
  const selectedSkinKey = selectedSkinItem?.stableKey.replace(/^skin\./, "");
  const selectedVirtualConfiguration = resolveVirtualManifestDefaults(
    rawVisibility ?? settings?.visibilityConfig,
    wallet?.publicBalance ?? false
  );
  const defaultConfiguration = resolveManifestDefaults();
  const completeDefaultConfiguration = {
    decorations: EMPTY_PROFILE_DECORATIONS,
    layoutKey: defaultConfiguration.layoutKey,
    showcases: defaultConfiguration.showcases,
    skinKey: defaultConfiguration.skinKey,
  };
  const virtualConfiguration = {
    decorations: EMPTY_PROFILE_DECORATIONS,
    layoutKey: selectedVirtualConfiguration.layoutKey,
    showcases: selectedVirtualConfiguration.showcases,
    skinKey: selectedVirtualConfiguration.skinKey,
  };

  if (!root) {
    return {
      configuration: virtualConfiguration,
      defaultConfiguration: completeDefaultConfiguration,
      isVirtual: true,
      revision: 0,
      showcaseErrors: {},
      decorations,
      effectiveConfiguration: resolveEffectiveProfileConfiguration(
        virtualConfiguration,
        {
          decorationEntitlements: {},
          layoutEntitlements: Object.fromEntries(
            layouts.map(({ entitled, key }) => [key, entitled])
          ),
          showcaseEntitlements: Object.fromEntries(
            Object.entries(showcaseEntitlements).map(([key, value]) => [
              key,
              value.entitled,
            ])
          ),
          skinEntitlements: Object.fromEntries(
            skins.map(({ entitled, key }) => [key, entitled])
          ),
        }
      ),
      layouts,
      showcaseEntitlements,
      skins,
    };
  }

  const defaultForMaterializedProfile = {
    ...completeDefaultConfiguration,
    showcases: completeDefaultConfiguration.showcases.map((showcase) => ({
      ...showcase,
      instanceId:
        rows.find(({ typeKey }) => typeKey === showcase.type)?.id ??
        showcase.instanceId,
    })),
  };

  const showcaseErrors: Record<string, string> = {};
  const configuredShowcases = rows
    .map((row) => {
      const definition = PROFILE_SHOWCASE_REGISTRY.find(
        ({ key }) => key === row.typeKey
      );
      if (!definition) {
        return null;
      }
      try {
        return {
          enabled: row.enabled,
          instanceId: row.id,
          order: row.order,
          payload: definition.migratePayload(
            row.payloadSchemaVersion,
            row.payload
          ),
          payloadSchemaVersion: definition.payloadSchemaVersion,
          type: definition.key,
          variant: row.variant,
        };
      } catch {
        showcaseErrors[row.typeKey] =
          "No pudimos actualizar este Showcase. Revisa su configuración antes de guardar.";
        return {
          enabled: false,
          instanceId: row.id,
          order: row.order,
          payload: row.payload,
          payloadSchemaVersion: row.payloadSchemaVersion,
          type: definition.key,
          variant: row.variant,
        };
      }
    })
    .filter((showcase) => showcase !== null)
    .toSorted((left, right) => left.order - right.order);
  const configuredTypes = new Set(configuredShowcases.map(({ type }) => type));
  const showcases = [
    ...configuredShowcases,
    ...PROFILE_SHOWCASE_REGISTRY.filter(
      ({ key }) => !configuredTypes.has(key)
    ).map((definition, index) => ({
      enabled: true,
      instanceId: `virtual:${definition.key}`,
      order: configuredShowcases.length + index,
      payload: definition.defaultPayload,
      payloadSchemaVersion: definition.payloadSchemaVersion,
      type: definition.key,
      variant: "standard" as const,
    })),
  ];

  const configuration = {
    decorations: Object.fromEntries(
      PROFILE_DECORATION_SLOTS.map((slot) => {
        const selected = equipped.find((row) => row.slot === slot);
        const item = selected
          ? catalogItems.find(({ id }) => id === selected.catalogItemId)
          : undefined;
        return [slot, item?.stableKey.replace(/^decoration\./, "") ?? null];
      })
    ) as ProfileCustomizationDraft["decorations"],
    layoutKey:
      LAYOUT_BY_ITEM_ID.get(root.selectedLayoutItemId)?.key ??
      PROFILE_DEFAULT_LAYOUT_KEY,
    showcases,
    skinKey: selectedSkinKey ?? PROFILE_DEFAULT_SKIN_KEY,
  } satisfies ProfileCustomizationDraft;
  const effectiveConfiguration = resolveEffectiveProfileConfiguration(
    configuration,
    {
      decorationEntitlements: Object.fromEntries(
        decorations.map(({ entitled, key }) => [key, entitled])
      ),
      layoutEntitlements: Object.fromEntries(
        layouts.map(({ entitled, key }) => [key, entitled])
      ),
      showcaseEntitlements: Object.fromEntries(
        Object.entries(showcaseEntitlements).map(([key, value]) => [
          key,
          value.entitled,
        ])
      ),
      skinEntitlements: Object.fromEntries(
        skins.map(({ entitled, key }) => [key, entitled])
      ),
    }
  );

  return {
    configuration,
    defaultConfiguration: defaultForMaterializedProfile,
    isVirtual: false,
    revision: root.revision,
    showcaseErrors,
    decorations,
    effectiveConfiguration,
    layouts,
    showcaseEntitlements,
    skins,
  };
}

export async function saveProfileCustomization(
  db: Database,
  input: {
    draft: unknown;
    expectedRevision: number;
    impersonated: boolean;
    role?: string;
    userId: string;
  }
) {
  if (input.impersonated) {
    throw new ProfileCustomizationError(
      "IMPERSONATION",
      "No puedes publicar cambios durante una sesión de suplantación."
    );
  }
  const prepared = prepareProfileCustomizationSave(input.draft);

  await db.transaction(async (tx) => {
    const current = await tx.query.profileCustomization.findFirst({
      where: eq(profileCustomization.userId, input.userId),
    });
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== input.expectedRevision) {
      throw new ProfileCustomizationError(
        "CONFLICT",
        "El perfil cambió en otra pestaña. Recarga el estado actual antes de volver a guardar."
      );
    }

    const [account, membership, ownerships, existingEquipped, wallet] =
      await Promise.all([
        tx.query.user.findFirst({
          columns: { role: true },
          where: eq(user.id, input.userId),
        }),
        tx.query.patron.findFirst({
          columns: { isActivePatron: true, tier: true },
          where: eq(patron.userId, input.userId),
        }),
        tx.query.profileCatalogOwnership.findMany({
          columns: { catalogItemId: true },
          where: and(
            eq(profileCatalogOwnership.userId, input.userId),
            sql`${profileCatalogOwnership.revokedAt} IS NULL`
          ),
        }),
        tx.query.profileEquippedDecoration.findMany({
          where: eq(profileEquippedDecoration.userId, input.userId),
        }),
        tx.query.eterisWallet.findFirst({
          columns: { status: true },
          where: eq(eterisWallet.userId, input.userId),
        }),
      ]);
    const entitlementBase = {
      isActivePatron: membership?.isActivePatron ?? false,
      ownedItemIds: ownerships.map(({ catalogItemId }) => catalogItemId),
      role: account?.role ?? "user",
      tier: membership?.tier ?? ("none" as const),
    };

    const [layout] = await tx
      .select({
        id: profileCatalogItem.id,
        isFree: profileCatalogItemRevision.isFree,
        lifecycle: profileCatalogItem.lifecycle,
        requiredTier: profileCatalogItemRevision.requiredTier,
      })
      .from(profileCatalogItem)
      .innerJoin(
        profileCatalogItemRevision,
        eq(
          profileCatalogItem.currentPublishedRevisionId,
          profileCatalogItemRevision.id
        )
      )
      .innerJoin(
        profileCatalogLayoutRevision,
        eq(
          profileCatalogLayoutRevision.revisionId,
          profileCatalogItemRevision.id
        )
      )
      .where(
        and(
          eq(profileCatalogItem.kind, "layout"),
          eq(
            profileCatalogLayoutRevision.rendererKey,
            prepared.configuration.layoutKey
          )
        )
      )
      .limit(1);
    const layoutAccess = layout
      ? resolveProfileEntitlements({
          ...entitlementBase,
          items: [layout],
        }).items[layout.id]
      : undefined;
    if (
      !layout ||
      (current?.selectedLayoutItemId !== layout.id && !layoutAccess?.selectable)
    ) {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        "No tienes acceso a la presentacion elegida.",
        { layoutKey: "Presentacion bloqueada o no disponible." }
      );
    }

    const [skin] = await tx
      .select({
        id: profileCatalogItem.id,
        isFree: profileCatalogItemRevision.isFree,
        lifecycle: profileCatalogItem.lifecycle,
        requiredTier: profileCatalogItemRevision.requiredTier,
      })
      .from(profileCatalogItem)
      .innerJoin(
        profileCatalogItemRevision,
        eq(
          profileCatalogItem.currentPublishedRevisionId,
          profileCatalogItemRevision.id
        )
      )
      .where(
        and(
          eq(profileCatalogItem.kind, "skin"),
          eq(
            profileCatalogItem.stableKey,
            `skin.${prepared.configuration.skinKey}`
          )
        )
      )
      .limit(1);
    if (!skin) {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        "El Skin elegido ya no está disponible.",
        { skinKey: "Skin no disponible." }
      );
    }
    const skinAccess = resolveProfileEntitlements({
      ...entitlementBase,
      items: [skin],
    }).items[skin.id]!;
    if (current?.selectedSkinItemId !== skin.id && !skinAccess.selectable) {
      throw new ProfileCustomizationError(
        "INVALID_DRAFT",
        "No tienes acceso al Skin elegido.",
        { skinKey: "Este Skin requiere una membresía activa." }
      );
    }

    const selectedDecorationKeys = Object.values(
      prepared.configuration.decorations
    ).filter((key): key is string => key !== null);
    const decorationRows =
      selectedDecorationKeys.length === 0
        ? []
        : await tx
            .select({
              id: profileCatalogItem.id,
              isFree: profileCatalogItemRevision.isFree,
              key: profileCatalogItem.stableKey,
              lifecycle: profileCatalogItem.lifecycle,
              requiredTier: profileCatalogItemRevision.requiredTier,
              slot: profileCatalogDecorationRevision.slot,
            })
            .from(profileCatalogItem)
            .innerJoin(
              profileCatalogItemRevision,
              eq(
                profileCatalogItem.currentPublishedRevisionId,
                profileCatalogItemRevision.id
              )
            )
            .innerJoin(
              profileCatalogDecorationRevision,
              eq(
                profileCatalogDecorationRevision.revisionId,
                profileCatalogItemRevision.id
              )
            )
            .where(
              and(
                eq(profileCatalogItem.kind, "decoration"),
                inArray(
                  profileCatalogItem.stableKey,
                  selectedDecorationKeys.map((key) => `decoration.${key}`)
                )
              )
            );
    const decorationsByKey = new Map(
      decorationRows.map((row) => [row.key.replace(/^decoration\./, ""), row])
    );
    const existingDecorationBySlot = new Map(
      existingEquipped.map((row) => [row.slot, row.catalogItemId])
    );
    for (const slot of PROFILE_DECORATION_SLOTS) {
      const key = prepared.configuration.decorations[slot];
      if (!key) {
        continue;
      }
      const decoration = decorationsByKey.get(key);
      if (!decoration || decoration.slot !== slot) {
        throw new ProfileCustomizationError(
          "INVALID_DRAFT",
          "La Decoration elegida no está disponible en ese slot.",
          {
            [`decorations.${slot}`]: "Decoration incompatible o no disponible.",
          }
        );
      }
      const entitled =
        existingDecorationBySlot.get(slot) === decoration.id ||
        resolveProfileEntitlements({
          ...entitlementBase,
          items: [decoration],
        }).items[decoration.id]?.selectable;
      if (!entitled) {
        throw new ProfileCustomizationError(
          "INVALID_DRAFT",
          "No tienes acceso a una Decoration elegida.",
          {
            [`decorations.${slot}`]:
              "Esta Decoration requiere una membresía activa.",
          }
        );
      }
    }

    const existingRows = await tx.query.profileShowcaseConfig.findMany({
      where: eq(profileShowcaseConfig.userId, input.userId),
    });
    const existingByType = new Map(
      existingRows.map((row) => [row.typeKey, row])
    );
    const showcaseTypes = await tx.query.profileShowcaseType.findMany();
    for (const showcase of prepared.configuration.showcases) {
      const existing = existingByType.get(showcase.type);
      const requirement = showcaseTypes.find(
        ({ key }) => key === showcase.type
      );
      const canEnable =
        (requirement?.isActive ?? true) &&
        satisfiesProfileVipRequirement(
          requirement?.requiredTier ?? "none",
          entitlementBase
        );
      if (showcase.enabled && !existing?.enabled && !canEnable) {
        throw new ProfileCustomizationError(
          "INVALID_DRAFT",
          "No tienes acceso a un Showcase elegido.",
          { [`showcases.${showcase.type}`]: "Este Showcase esta bloqueado." }
        );
      }
    }
    const favoriteGames = prepared.configuration.showcases.find(
      ({ type }) => type === "favorite-games"
    );
    if (favoriteGames) {
      const nextIds = favoriteGamesShowcasePayloadSchema.parse(
        favoriteGames.payload
      ).gameIds;
      const existingFavorite = existingByType.get("favorite-games");
      let existingIds: string[] = [];
      if (existingFavorite) {
        try {
          existingIds = migrateFavoriteGamesPayload(
            existingFavorite.payloadSchemaVersion,
            existingFavorite.payload
          ).gameIds;
        } catch {
          existingIds = [];
        }
      }
      const newlyAddedIds = nextIds.filter((id) => !existingIds.includes(id));
      const eligibleAdded = await loadPublicGameProjections(tx, newlyAddedIds);
      if (eligibleAdded.length !== newlyAddedIds.length) {
        throw new ProfileCustomizationError(
          "INVALID_DRAFT",
          "Uno de los juegos elegidos ya no está disponible públicamente.",
          {
            "showcases.favorite-games.payload":
              "Quita el juego no disponible antes de guardar.",
          }
        );
      }
      const { capacity } = await loadFavoriteGamesEntitlement(tx, input.userId);
      if (nextIds.length > capacity && newlyAddedIds.length > 0) {
        throw new ProfileCustomizationError(
          "INVALID_DRAFT",
          "Alcanzaste la capacidad actual de Juegos favoritos.",
          {
            "showcases.favorite-games.payload": `Tu capacidad actual es ${capacity}.`,
          }
        );
      }
    }
    for (const showcase of prepared.configuration.showcases) {
      const existing = existingByType.get(showcase.type);
      if (existing && existing.id !== showcase.instanceId) {
        throw new ProfileCustomizationError(
          "INVALID_DRAFT",
          "La identidad estable de un Showcase no puede cambiar.",
          { [`showcases.${showcase.type}.instanceId`]: "Instancia inválida." }
        );
      }
    }

    const nextRevision = currentRevision + 1;
    if (current) {
      const updated = await tx
        .update(profileCustomization)
        .set({
          revision: nextRevision,
          selectedLayoutItemId: layout.id,
          selectedSkinItemId: skin.id,
        })
        .where(
          and(
            eq(profileCustomization.userId, input.userId),
            eq(profileCustomization.revision, input.expectedRevision)
          )
        )
        .returning({ revision: profileCustomization.revision });
      if (updated.length !== 1) {
        throw new ProfileCustomizationError(
          "CONFLICT",
          "El perfil cambió mientras intentabas guardarlo."
        );
      }
    } else {
      const inserted = await tx
        .insert(profileCustomization)
        .values({
          revision: nextRevision,
          selectedLayoutItemId: layout.id,
          selectedSkinItemId: skin.id,
          userId: input.userId,
        })
        .onConflictDoNothing({ target: profileCustomization.userId })
        .returning({ revision: profileCustomization.revision });
      if (inserted.length !== 1) {
        throw new ProfileCustomizationError(
          "CONFLICT",
          "El perfil cambió mientras intentabas guardarlo."
        );
      }
    }

    await tx
      .delete(profileShowcaseConfig)
      .where(eq(profileShowcaseConfig.userId, input.userId));
    await tx.insert(profileShowcaseConfig).values(
      prepared.configuration.showcases.map((showcase) => ({
        enabled: showcase.enabled,
        id: existingByType.get(showcase.type)?.id ?? generateId(),
        order: showcase.order,
        payload: showcase.payload,
        payloadSchemaVersion: showcase.payloadSchemaVersion,
        typeKey: showcase.type,
        userId: input.userId,
        variant: showcase.variant,
      }))
    );

    await tx
      .delete(profileEquippedDecoration)
      .where(eq(profileEquippedDecoration.userId, input.userId));
    if (decorationRows.length > 0) {
      await tx.insert(profileEquippedDecoration).values(
        PROFILE_DECORATION_SLOTS.flatMap((slot) => {
          const key = prepared.configuration.decorations[slot];
          const decoration = key ? decorationsByKey.get(key) : undefined;
          return decoration
            ? [{ catalogItemId: decoration.id, slot, userId: input.userId }]
            : [];
        })
      );
    }

    await tx
      .insert(profileSettings)
      .values({ userId: input.userId })
      .onConflictDoNothing({ target: profileSettings.userId });
    await tx
      .update(profileSettings)
      .set({
        visibilityConfig: sql`jsonb_set(jsonb_set(jsonb_set(CASE WHEN jsonb_typeof(${profileSettings.visibilityConfig}) = 'object' THEN ${profileSettings.visibilityConfig} ELSE '{}'::jsonb END, '{favorites}', ${JSON.stringify(prepared.visibility.favorites)}::jsonb, true), '{reviews}', ${JSON.stringify(prepared.visibility.reviews)}::jsonb, true), '{streak}', ${JSON.stringify(prepared.visibility.streak)}::jsonb, true)`,
      })
      .where(eq(profileSettings.userId, input.userId));

    await setPublicWalletBalanceInTransaction(
      tx,
      input.userId,
      prepared.visibility.eteris && wallet && wallet.status !== "active"
        ? false
        : prepared.visibility.eteris
    );
  });

  return loadProfileCustomizationEditorState(db, input.userId);
}
