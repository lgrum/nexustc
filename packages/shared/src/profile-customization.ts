import z from "zod";

import type { PatronTier } from "./constants";

export const PROFILE_LAYOUT_KEYS = ["stack", "grid", "spotlight"] as const;
export const PROFILE_SHOWCASE_VARIANTS = [
  "compact",
  "standard",
  "featured",
] as const;
export const PROFILE_SHOWCASE_TYPE_KEYS = [
  "library",
  "reviews",
  "favorite-games",
  "xp",
  "streak",
  "eteris",
] as const;
export const PROFILE_DECORATION_SLOTS = [
  "avatar-frame",
  "nameplate-effect",
  "profile-frame",
  "ambient-effect",
] as const;
export const PROFILE_DECORATION_EFFECT_KEYS = [
  "soft-pulse",
  "orbit-sparkles",
  "shimmer",
] as const;
export const PROFILE_DECORATION_FONT_KEYS = ["lexend", "system"] as const;
export const PROFILE_CATALOG_KINDS = ["layout", "skin", "decoration"] as const;
export const PROFILE_CATALOG_LIFECYCLES = [
  "draft",
  "active",
  "archived",
  "disabled",
] as const;
export const PROFILE_CATALOG_REVISION_STATES = ["draft", "published"] as const;
export const PROFILE_CATALOG_OWNERSHIP_SOURCES = ["purchase", "grant"] as const;

export const PROFILE_SKIN_BORDER_WIDTHS = ["none", "thin", "medium"] as const;
export const PROFILE_SKIN_RADII = ["sharp", "soft", "round"] as const;
export const PROFILE_SKIN_SHADOWS = ["none", "soft", "strong"] as const;
export const PROFILE_SKIN_CARD_ACCENTS = ["none", "top", "side"] as const;

const profileSkinColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Usa un color hexadecimal de seis dígitos.");

export const profileSkinBackgroundSchema = z.discriminatedUnion("kind", [
  z
    .object({ color: profileSkinColorSchema, kind: z.literal("solid") })
    .strict(),
  z
    .object({
      angle: z.number().int().min(0).max(359),
      kind: z.literal("gradient"),
      stops: z
        .array(
          z
            .object({
              color: profileSkinColorSchema,
              position: z.number().int().min(0).max(100),
            })
            .strict()
        )
        .min(2)
        .max(4),
    })
    .strict()
    .superRefine(({ stops }, context) => {
      if (
        stops.some(
          (stop, index) =>
            index > 0 && stop.position <= stops[index - 1]!.position
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Las paradas del degradado deben avanzar sin repetirse.",
          path: ["stops"],
        });
      }
    }),
]);

export const profileSkinTokensSchema = z
  .object({
    accent: profileSkinColorSchema,
    background: profileSkinBackgroundSchema,
    borderColor: profileSkinColorSchema,
    borderWidth: z.enum(PROFILE_SKIN_BORDER_WIDTHS),
    cardAccent: z.enum(PROFILE_SKIN_CARD_ACCENTS),
    focus: profileSkinColorSchema,
    foreground: profileSkinColorSchema,
    mutedForeground: profileSkinColorSchema,
    radius: z.enum(PROFILE_SKIN_RADII),
    shadow: z.enum(PROFILE_SKIN_SHADOWS),
    shellOpacity: z.number().min(0.72).max(1),
    shellSurface: profileSkinColorSchema,
    showcaseOpacity: z.number().min(0.72).max(1),
    showcaseSurface: profileSkinColorSchema,
  })
  .strict();

export type ProfileSkinTokens = z.infer<typeof profileSkinTokensSchema>;
export type ProfileSkinCatalogEntry = {
  backgroundAssetKey: string | null;
  description: string;
  eterisPrice: bigint | null;
  entitled: boolean;
  isFree: boolean;
  itemId: string;
  key: string;
  lifecycle: (typeof PROFILE_CATALOG_LIFECYCLES)[number];
  name: string;
  permanentlyOwned?: boolean;
  requiredTier: PatronTier | null;
  revision?: number;
  selectable: boolean;
  tokens: ProfileSkinTokens;
};

export const PROFILE_DEFAULT_SKIN_TOKENS = {
  accent: "#a855f7",
  background: { color: "#09090b", kind: "solid" },
  borderColor: "#3f3f46",
  borderWidth: "thin",
  cardAccent: "none",
  focus: "#c084fc",
  foreground: "#fafafa",
  mutedForeground: "#a1a1aa",
  radius: "soft",
  shadow: "soft",
  shellOpacity: 0.94,
  shellSurface: "#18181b",
  showcaseOpacity: 0.9,
  showcaseSurface: "#18181b",
} as const satisfies ProfileSkinTokens;

export const PROFILE_DEFAULT_LAYOUT_KEY = "stack" as const;
export const PROFILE_DEFAULT_SKIN_KEY = "default" as const;
export const PROFILE_LAYOUT_REGISTRY = [
  {
    description:
      "Una secuencia vertical que adapta la densidad de cada Showcase.",
    isProtectedDefault: true,
    itemId: "profile-layout-default",
    key: "stack",
    name: "Pila",
  },
  {
    description: "Dos columnas en pantallas amplias y una secuencia en móvil.",
    isProtectedDefault: false,
    itemId: "profile-layout-grid",
    key: "grid",
    name: "Cuadrícula",
  },
  {
    description:
      "Destaca el primer Showcase disponible y ordena el resto en cuadrícula.",
    isProtectedDefault: false,
    itemId: "profile-layout-spotlight",
    key: "spotlight",
    name: "Foco",
  },
] as const satisfies readonly {
  description: string;
  isProtectedDefault: boolean;
  itemId: string;
  key: ProfileLayoutKey;
  name: string;
}[];
export const PROFILE_MAX_RENDERABLE_SHOWCASES = 12;
export const FAVORITE_GAMES_MAX_SAVED = 10;
export const FAVORITE_GAMES_SEARCH_LIMIT = 20;
export const FAVORITE_GAMES_CAPACITY_LADDER = [
  { capacity: 10, minimumTier: "level12" },
  { capacity: 7, minimumTier: "level5" },
  { capacity: 3, minimumTier: "level1" },
  { capacity: 1, minimumTier: "none" },
] as const;
export const PROFILE_SHOWCASE_PAGE_SIZES = {
  library: { compact: 6, featured: 18, standard: 12 },
  reviews: { compact: 3, featured: 15, standard: 10 },
} as const;

export type ProfileLayoutKey = (typeof PROFILE_LAYOUT_KEYS)[number];
export type ProfileShowcaseVariant = (typeof PROFILE_SHOWCASE_VARIANTS)[number];
export type ProfileShowcaseTypeKey =
  (typeof PROFILE_SHOWCASE_TYPE_KEYS)[number];
export const PROFILE_SHOWCASE_VARIANTS_BY_TYPE = {
  eteris: ["compact", "standard"],
  "favorite-games": PROFILE_SHOWCASE_VARIANTS,
  library: PROFILE_SHOWCASE_VARIANTS,
  reviews: PROFILE_SHOWCASE_VARIANTS,
  streak: ["compact", "standard"],
  xp: ["compact", "standard"],
} as const satisfies Record<
  ProfileShowcaseTypeKey,
  readonly ProfileShowcaseVariant[]
>;
export type ProfileDecorationSlot = (typeof PROFILE_DECORATION_SLOTS)[number];
export type ProfileDecorationEffectKey =
  (typeof PROFILE_DECORATION_EFFECT_KEYS)[number];
export type ProfileDecorationFontKey =
  (typeof PROFILE_DECORATION_FONT_KEYS)[number];

export const profileDecorationReducedMotionSchema = z
  .object({ behavior: z.enum(["static", "omit"]) })
  .strict();

export const profileDecorationVisualSchema = z
  .object({
    effectKey: z.enum(PROFILE_DECORATION_EFFECT_KEYS).nullable(),
    fontKey: z.enum(PROFILE_DECORATION_FONT_KEYS).nullable(),
    mediaAssetKey: z.string().min(1).nullable(),
    reducedMotion: profileDecorationReducedMotionSchema.nullable(),
    slot: z.enum(PROFILE_DECORATION_SLOTS),
  })
  .strict()
  .superRefine((visual, context) => {
    if (visual.fontKey && visual.slot !== "nameplate-effect") {
      context.addIssue({
        code: "custom",
        message: "Las fuentes solo pertenecen al Nameplate Effect.",
        path: ["fontKey"],
      });
    }
    if (
      visual.effectKey &&
      visual.effectKey !== "shimmer" &&
      !visual.reducedMotion
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Los efectos animados necesitan un fallback de movimiento reducido.",
        path: ["reducedMotion"],
      });
    }
  });

export type ProfileDecorationVisual = z.infer<
  typeof profileDecorationVisualSchema
>;
export type ProfileDecorationCatalogEntry = ProfileDecorationVisual & {
  description: string;
  eterisPrice: bigint | null;
  entitled: boolean;
  isFree: boolean;
  itemId: string;
  key: string;
  lifecycle: (typeof PROFILE_CATALOG_LIFECYCLES)[number];
  name: string;
  permanentlyOwned?: boolean;
  requiredTier: PatronTier | null;
  revision?: number;
  selectable: boolean;
};

export type ProfileLayoutCatalogEntry = {
  description: string;
  eterisPrice: bigint | null;
  entitled: boolean;
  isFree: boolean;
  itemId: string;
  key: ProfileLayoutKey;
  lifecycle: (typeof PROFILE_CATALOG_LIFECYCLES)[number];
  name: string;
  permanentlyOwned?: boolean;
  requiredTier: PatronTier | null;
  revision?: number;
  selectable: boolean;
};

export type ProfileShowcaseEntitlement = {
  entitled: boolean;
  requiredTier: PatronTier;
};

export const EMPTY_PROFILE_DECORATIONS = {
  "ambient-effect": null,
  "avatar-frame": null,
  "nameplate-effect": null,
  "profile-frame": null,
} as const satisfies Record<ProfileDecorationSlot, null>;

export const profileDecorationSelectionsSchema = z
  .object({
    "ambient-effect": z.string().min(1).max(128).nullable(),
    "avatar-frame": z.string().min(1).max(128).nullable(),
    "nameplate-effect": z.string().min(1).max(128).nullable(),
    "profile-frame": z.string().min(1).max(128).nullable(),
  })
  .strict();

export const profileShowcaseDraftSchema = z.object({
  enabled: z.boolean(),
  instanceId: z.string().min(1).max(128),
  order: z
    .number()
    .int()
    .nonnegative()
    .max(PROFILE_MAX_RENDERABLE_SHOWCASES - 1),
  payload: z.record(z.string(), z.unknown()),
  payloadSchemaVersion: z.number().int().positive(),
  type: z.enum(PROFILE_SHOWCASE_TYPE_KEYS),
  variant: z.enum(PROFILE_SHOWCASE_VARIANTS),
});

export const profileCustomizationDraftSchema = z.object({
  decorations: profileDecorationSelectionsSchema.default(
    EMPTY_PROFILE_DECORATIONS
  ),
  layoutKey: z.enum(PROFILE_LAYOUT_KEYS),
  showcases: z
    .array(profileShowcaseDraftSchema)
    .min(1)
    .max(PROFILE_MAX_RENDERABLE_SHOWCASES),
  skinKey: z.string().min(1).max(128),
});

export type ProfileShowcaseDraft = z.infer<typeof profileShowcaseDraftSchema>;
export type ProfileCustomizationDraft = z.infer<
  typeof profileCustomizationDraftSchema
>;

export type ProfileCustomizationEditorState = {
  configuration: ProfileCustomizationDraft;
  defaultConfiguration: ProfileCustomizationDraft;
  effectiveConfiguration: ProfileCustomizationDraft;
  isVirtual: boolean;
  revision: number;
  showcaseErrors: Record<string, string>;
  decorations?: ProfileDecorationCatalogEntry[];
  layouts?: ProfileLayoutCatalogEntry[];
  showcaseEntitlements?: Partial<
    Record<ProfileShowcaseTypeKey, ProfileShowcaseEntitlement>
  >;
  skins?: ProfileSkinCatalogEntry[];
};

export const automaticShowcasePayloadSchema = z.object({}).strict();
export const favoriteGamesShowcasePayloadSchema = z
  .object({
    gameIds: z
      .array(z.string().min(1).max(128))
      .max(FAVORITE_GAMES_MAX_SAVED)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Cada juego puede aparecer una sola vez.",
      }),
  })
  .strict();

export type FavoriteGameProjection = {
  coverImageObjectKey: string | null;
  id: string;
  slug: string;
  title: string;
};

export type FavoriteGamesEditorState = {
  capacity: number;
  selected: {
    active: boolean;
    game: FavoriteGameProjection | null;
    id: string;
  }[];
  suggestions: FavoriteGameProjection[];
};

export type EffectiveProfileShowcase =
  | {
      order: number;
      rendererKey: "library" | "reviews";
      type: "library" | "reviews";
      variant: ProfileShowcaseVariant;
    }
  | {
      games: FavoriteGameProjection[];
      order: number;
      rendererKey: "favorite-games";
      type: "favorite-games";
      variant: ProfileShowcaseVariant;
    }
  | {
      accountLevel: number;
      currentLevelXp: number;
      nextLevelRequirement: number | null;
      order: number;
      progress: number;
      rendererKey: "xp";
      type: "xp";
      variant: "compact" | "standard";
      xpRemaining: number | null;
    }
  | {
      currentStreak: number;
      nextMilestone: number | null;
      order: number;
      rendererKey: "streak";
      type: "streak";
      variant: "compact" | "standard";
    }
  | {
      balance: string;
      order: number;
      rendererKey: "eteris";
      type: "eteris";
      variant: "compact" | "standard";
    };

export type EffectiveProfileManifest = {
  decorations: ProfileDecorationVisual[];
  layout: { rendererKey: ProfileLayoutKey };
  showcases: EffectiveProfileShowcase[];
  skin: {
    backgroundAssetKey: string | null;
    key: string;
    tokens: ProfileSkinTokens;
  };
};
