import * as z from "zod";

import {
  DOCUMENT_STATUSES,
  RATING_REVIEW_MAX_LENGTH,
  TAXONOMIES,
} from "./constants";
import { normalizeEngagementPromptList } from "./engagement-prompts";

export const termCreateSchema = z.object({
  color1: z.string().trim().max(7),
  color2: z.string().trim().max(7),
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .transform((val) => val.trim()),
  taxonomy: z.enum(TAXONOMIES),
  textColor: z.string().trim().max(7),
});

export const termUpdateSchema = termCreateSchema
  .extend({
    id: z.string(),
  })
  .omit({
    taxonomy: true,
  });

export const engagementPromptTextSchema = z
  .string()
  .trim()
  .max(220, "No puede exceder los 220 caracteres.")
  .transform((val) => val.trim());

export const engagementPromptRequiredTextSchema = z
  .string()
  .trim()
  .min(1, "La pregunta es obligatoria.")
  .max(220, "No puede exceder los 220 caracteres.")
  .transform((val) => val.trim());

export const manualEngagementQuestionsSchema = z
  .array(z.string())
  .transform((items) => normalizeEngagementPromptList(items))
  .pipe(
    z
      .array(engagementPromptTextSchema)
      .max(2, "Solo se permiten hasta 2 preguntas manuales.")
  );

const optionalEngagementTagTermIdSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? undefined : trimmedValue;
}, z.string().trim().min(1).optional());

const engagementQuestionBaseSchema = z.object({
  isActive: z.boolean().default(true),
  isGlobal: z.boolean().default(false),
  locale: z.literal("es").default("es"),
  tagTermId: optionalEngagementTagTermIdSchema,
  text: engagementPromptRequiredTextSchema,
});

export const engagementQuestionCreateSchema =
  engagementQuestionBaseSchema.superRefine((value, ctx) => {
    if (!(value.isGlobal || value.tagTermId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe seleccionar un tag o marcar la pregunta como global.",
        path: ["tagTermId"],
      });
    }
  });

export const engagementQuestionUpdateSchema = engagementQuestionBaseSchema
  .extend({
    id: z.string(),
  })
  .superRefine((value, ctx) => {
    if (!(value.isGlobal || value.tagTermId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe seleccionar un tag o marcar la pregunta como global.",
        path: ["tagTermId"],
      });
    }
  });

const contentBaseFields = {
  censorship: z.string(),
  documentStatus: z.enum(DOCUMENT_STATUSES),
  files: z
    .array(
      z.file().mime(["image/gif", "image/jpeg", "image/png", "image/webp"])
    )
    .optional(),
  languages: z.array(z.string()),
  manualEngagementQuestions: manualEngagementQuestionsSchema,
  tags: z.array(z.string()),
  title: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .transform((val) => val.trim()),
};

export const postCreateSchema = z.object({
  ...contentBaseFields,
  adsLinks: z.string(),
  changelog: z.string(),
  content: z
    .string()
    .trim()
    .max(65_535)
    .transform((val) => val.trim()),
  creatorLink: z.union([z.url("No es un link válido"), z.literal("")]),
  creatorName: z.string(),
  engine: z.string(),
  graphics: z.string(),
  platforms: z.array(z.string()),
  premiumLinks: z.string(),
  status: z.string().min(1, "Debe seleccionar un estado"),
  type: z.literal("post"),
  version: z.string().trim().max(255),
});

export const comicCreateSchema = z.object({
  ...contentBaseFields,
  adsLinks: z.string(),
  changelog: z.string().optional(),
  content: z.string().optional(),
  creatorLink: z
    .union([z.url("No es un link válido"), z.literal("")])
    .optional(),
  creatorName: z.string().optional(),
  engine: z.string().optional(),
  graphics: z.string().optional(),
  languages: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  premiumLinks: z.string(),
  status: z.string().min(1, "Debe seleccionar un estado"),
  type: z.literal("comic"),
  version: z.string().optional(),
});

export const contentCreateSchema = z.discriminatedUnion("type", [
  postCreateSchema,
  comicCreateSchema,
]);

export const postEditSchema = postCreateSchema.extend({ id: z.string() });
export const comicEditSchema = comicCreateSchema.extend({ id: z.string() });
export const contentEditSchema = z.discriminatedUnion("type", [
  postEditSchema,
  comicEditSchema,
]);

export const ratingCreateSchema = z.object({
  postId: z.string().min(1),
  rating: z.number().int().min(1).max(10),
  review: z
    .string()
    .trim()
    .max(RATING_REVIEW_MAX_LENGTH)
    .transform((val) => val.trim())
    .optional()
    .default(""),
});

export const ratingUpdateSchema = z.object({
  postId: z.string().min(1),
  rating: z.number().int().min(1).max(10),
  review: z
    .string()
    .trim()
    .max(RATING_REVIEW_MAX_LENGTH)
    .transform((val) => val.trim())
    .optional()
    .default(""),
});

export const chronosUpdateSchema = z.object({
  carouselImageKeys: z.array(z.string()).optional(),
  headerImageKey: z.string().optional(),
  markdownContent: z.string().max(65_535),
  markdownImageKeys: z.array(z.string()).optional(),
  stickyImageKey: z.string().optional(),
});

export const contentEditImagesSchema = z.object({
  newFiles: z
    .array(
      z.file().mime(["image/gif", "image/jpeg", "image/png", "image/webp"])
    )
    .optional(),
  order: z.array(
    z.discriminatedUnion("type", [
      z.object({ key: z.string(), type: z.literal("existing") }),
      z.object({ index: z.number().int().min(0), type: z.literal("new") }),
    ])
  ),
  postId: z.string(),
  type: z.enum(["post", "comic"]),
});

export const staticPageUpdateSchema = z.object({
  content: z.string().max(65_535),
  slug: z.enum(["about", "legal", "privacy", "terms"]),
  title: z.string().trim().min(1).max(255),
});
