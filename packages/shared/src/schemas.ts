import * as z from "zod";
import {
  DOCUMENT_STATUSES,
  RATING_REVIEW_MAX_LENGTH,
  TAXONOMIES,
} from "./constants";
import { normalizeEngagementPromptList } from "./engagement-prompts";

export const termCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .transform((val) => val.trim()),
  color1: z.string().trim().max(7),
  color2: z.string().trim().max(7),
  textColor: z.string().trim().max(7),
  taxonomy: z.enum(TAXONOMIES),
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
  tagTermId: optionalEngagementTagTermIdSchema,
  isGlobal: z.boolean().default(false),
  text: engagementPromptRequiredTextSchema,
  isActive: z.boolean().default(true),
  locale: z.literal("es").default("es"),
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
  title: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .transform((val) => val.trim()),
  censorship: z.string(),
  tags: z.array(z.string()),
  languages: z.array(z.string()),
  documentStatus: z.enum(DOCUMENT_STATUSES),
  files: z
    .array(
      z.file().mime(["image/gif", "image/jpeg", "image/png", "image/webp"])
    )
    .optional(),
  manualEngagementQuestions: manualEngagementQuestionsSchema,
};

export const postCreateSchema = z.object({
  ...contentBaseFields,
  type: z.literal("post"),
  version: z.string().trim().max(255),
  status: z.string().min(1, "Debe seleccionar un estado"),
  engine: z.string(),
  graphics: z.string(),
  platforms: z.array(z.string()),
  adsLinks: z.string(),
  premiumLinks: z.string(),
  changelog: z.string(),
  creatorName: z.string(),
  creatorLink: z.union([z.url("No es un link válido"), z.literal("")]),
  content: z
    .string()
    .trim()
    .max(65_535)
    .transform((val) => val.trim()),
});

export const comicCreateSchema = z.object({
  ...contentBaseFields,
  type: z.literal("comic"),
  languages: z.array(z.string()).optional(),
  version: z.string().optional(),
  status: z.string().min(1, "Debe seleccionar un estado"),
  engine: z.string().optional(),
  graphics: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  adsLinks: z.string(),
  premiumLinks: z.string(),
  changelog: z.string().optional(),
  creatorName: z.string().optional(),
  creatorLink: z
    .union([z.url("No es un link válido"), z.literal("")])
    .optional(),
  content: z.string().optional(),
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
  stickyImageKey: z.string().optional(),
  headerImageKey: z.string().optional(),
  carouselImageKeys: z.array(z.string()).optional(),
  markdownContent: z.string().max(65_535),
  markdownImageKeys: z.array(z.string()).optional(),
});

export const contentEditImagesSchema = z.object({
  postId: z.string(),
  type: z.enum(["post", "comic"]),
  order: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("existing"), key: z.string() }),
      z.object({ type: z.literal("new"), index: z.number().int().min(0) }),
    ])
  ),
  newFiles: z
    .array(
      z.file().mime(["image/gif", "image/jpeg", "image/png", "image/webp"])
    )
    .optional(),
});

export const staticPageUpdateSchema = z.object({
  slug: z.enum(["about", "legal", "privacy", "terms"]),
  title: z.string().trim().min(1).max(255),
  content: z.string().max(65_535),
});
