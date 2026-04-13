import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import { z } from "zod";

const tierSourceKeySchema = z.enum(PATRON_TIER_KEYS);

export const membershipAssetSchema = z.object({
  accent: z.string().optional(),
  emoji: z.string().optional(),
  id: z.string(),
  imageSrc: z.string().url().optional(),
  label: z.string(),
});

export const themePaletteSchema = z.object({
  colors: z.array(z.string()).min(3),
  gradient: z.string(),
  id: z.string(),
  label: z.string(),
});

export const badgeStageSchema = z.object({
  accent: z.string(),
  emoji: z.string(),
  id: z.string(),
  label: z.string(),
  monthsRequired: z.number().min(0),
});

const featureValueBaseSchema = z.object({
  detail: z.string().optional(),
  emphasis: z.string().optional(),
});

export const featureValueSchema = z.discriminatedUnion("kind", [
  featureValueBaseSchema.extend({
    enabled: z.boolean(),
    kind: z.literal("boolean"),
  }),
  featureValueBaseSchema.extend({
    kind: z.literal("counter"),
    suffix: z.string().optional(),
    value: z.number().nonnegative(),
  }),
  featureValueBaseSchema.extend({
    items: z.array(membershipAssetSchema),
    kind: z.literal("assets"),
  }),
  featureValueBaseSchema.extend({
    kind: z.literal("palette"),
    palettes: z.array(themePaletteSchema).min(1),
  }),
  featureValueBaseSchema.extend({
    kind: z.literal("timeline"),
    phases: z.array(
      z.object({
        accent: z.string(),
        hours: z.number().nonnegative(),
        label: z.string(),
      })
    ),
  }),
  featureValueBaseSchema.extend({
    adFree: z.boolean(),
    kind: z.literal("ad-preview"),
    placeholderLabel: z.string(),
    slots: z.number().int().positive(),
  }),
]);

export const featureDefinitionSchema = z.object({
  icon: z.string(),
  id: z.string(),
  kind: z.enum([
    "boolean",
    "counter",
    "assets",
    "palette",
    "timeline",
    "ad-preview",
  ]),
  label: z.string(),
  narrative: z.string(),
  shortLabel: z.string(),
});

export const membershipTierSchema = z.object({
  badgeEvolution: z.object({
    previewMonths: z.number().min(0),
    stages: z.array(badgeStageSchema).min(2),
  }),
  billingLabel: z.string(),
  conversionNote: z.string(),
  ctaLabel: z.string(),
  emphasis: z.enum(["entry", "mid", "premium", "legend"]),
  eyebrow: z.string(),
  featureValues: z.record(z.string(), featureValueSchema),
  id: z.string(),
  identity: z.object({
    badgeAccent: z.string(),
    badgeLabel: z.string(),
    glow: z.string(),
    gradient: z.array(z.string()).min(2),
    sampleName: z.string(),
    subtitle: z.string(),
  }),
  name: z.string(),
  order: z.number().int().nonnegative(),
  patronUrl: z.string().url(),
  popularityNote: z.string(),
  priceLabel: z.string(),
  recommendationBonus: z.number().default(0),
  shortName: z.string(),
  sourceTierKey: tierSourceKeySchema.optional(),
  spotlightLabel: z.string().optional(),
  tagline: z.string(),
  visual: z.object({
    border: z.string(),
    glow: z.string(),
    surface: z.string(),
    text: z.string(),
  }),
  xp: z.object({
    level: z.number().int().nonnegative(),
    monthlyBoost: z.number().nonnegative(),
    nextLevelXp: z.number().positive(),
    upgradeBonusXp: z.number().nonnegative(),
    xp: z.number().nonnegative(),
  }),
});

export const surveyQuestionSchema = z.object({
  id: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      summary: z.string(),
      weights: z.record(z.string(), z.number()),
    })
  ),
  prompt: z.string(),
});

export const membershipUpgradeConfigSchema = z.object({
  comparisonDefaults: z.object({
    currentTierId: z.string(),
    featureTab: z.enum(["shared", "unlocked", "missing"]),
    targetTierId: z.string(),
  }),
  editorLabel: z.string(),
  features: z.array(featureDefinitionSchema).min(1),
  hero: z.object({
    eyebrow: z.string(),
    subtitle: z.string(),
    title: z.string(),
  }),
  recommendation: z.object({
    fallbackTierId: z.string(),
    intro: z.string(),
    questions: z.array(surveyQuestionSchema).min(1),
  }),
  tiers: z.array(membershipTierSchema).min(2),
});

export type MembershipAsset = z.infer<typeof membershipAssetSchema>;
export type ThemePalette = z.infer<typeof themePaletteSchema>;
export type BadgeStage = z.infer<typeof badgeStageSchema>;
export type FeatureDefinition = z.infer<typeof featureDefinitionSchema>;
export type FeatureValue = z.infer<typeof featureValueSchema>;
export type MembershipTier = z.infer<typeof membershipTierSchema>;
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;
export type MembershipUpgradeConfig = z.infer<
  typeof membershipUpgradeConfigSchema
>;

export type FeatureDiffStatus = "missing" | "shared" | "unlocked";
