import { and, asc, eq, ilike, inArray } from "@repo/db";
import type { db as database } from "@repo/db";
import { cardCharacter, cardSeries, cardTemplate } from "@repo/db/schema/app";
import {
  cardPublicTemplateSchema,
  cardRenderedVariantSchema,
  getDisabledCardPlaceholder,
} from "@repo/shared/collectibles";
import type { CardPublicTemplate } from "@repo/shared/collectibles";
import z from "zod";

type Database = typeof database;

export const publicCardCatalogQuerySchema = z
  .object({
    characterId: z.string().trim().min(1).optional(),
    game: z.string().trim().max(160).optional(),
    limit: z.number().int().min(1).max(60).default(24),
    rarity: z
      .enum(["common", "uncommon", "rare", "epic", "legendary"])
      .optional(),
    seriesId: z.string().trim().min(1).optional(),
  })
  .strict();

function parseVariants(value: unknown) {
  const parsed = z.array(cardRenderedVariantSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function publicRow(row: {
  availability: "active" | "disabled";
  characterName: string;
  description: string;
  edition: string | null;
  gameName: string;
  id: string;
  lifetimeSupplyCeiling: number | null;
  presentationMetadata: unknown;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  renderedVariants: unknown;
  seriesName: string;
}): CardPublicTemplate {
  if (row.availability === "disabled") {
    return getDisabledCardPlaceholder({
      id: row.id,
      rarity: row.rarity,
      seriesName: row.seriesName,
    });
  }
  const parsed = cardPublicTemplateSchema.safeParse({
    characterName: row.characterName,
    description: row.description,
    disabled: false,
    edition: row.edition,
    gameName: row.gameName,
    id: row.id,
    lifetimeSupplyCeiling: row.lifetimeSupplyCeiling,
    presentation: row.presentationMetadata,
    rarity: row.rarity,
    renderedVariants: parseVariants(row.renderedVariants),
    seriesName: row.seriesName,
  });
  if (!parsed.success) {
    throw new Error("La presentación pública de la plantilla no es válida.");
  }
  return parsed.data;
}

type CardCatalogDb = Pick<Database, "select">;

const publicCardColumns = {
  availability: cardTemplate.availability,
  characterName: cardCharacter.characterName,
  description: cardTemplate.description,
  edition: cardTemplate.edition,
  gameName: cardCharacter.gameName,
  id: cardTemplate.id,
  lifetimeSupplyCeiling: cardTemplate.lifetimeSupplyCeiling,
  presentationMetadata: cardTemplate.presentationMetadata,
  rarity: cardTemplate.rarity,
  renderedVariants: cardTemplate.renderedVariants,
  seriesName: cardSeries.name,
};

export async function listPublishedCardTemplates(
  db: CardCatalogDb,
  input: z.input<typeof publicCardCatalogQuerySchema> = {}
) {
  const query = publicCardCatalogQuerySchema.parse(input);
  const rows = await db
    .select(publicCardColumns)
    .from(cardTemplate)
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(
      and(
        eq(cardTemplate.lifecycle, "active"),
        eq(cardTemplate.availability, "active"),
        query.characterId
          ? eq(cardTemplate.characterId, query.characterId)
          : undefined,
        query.game
          ? ilike(cardCharacter.normalizedGameName, `%${query.game}%`)
          : undefined,
        query.rarity ? eq(cardTemplate.rarity, query.rarity) : undefined,
        query.seriesId ? eq(cardTemplate.seriesId, query.seriesId) : undefined
      )
    )
    .orderBy(
      asc(cardSeries.name),
      asc(cardCharacter.characterName),
      asc(cardTemplate.id)
    )
    .limit(query.limit);
  return rows.map(publicRow);
}

export async function getPublishedCardTemplate(
  db: CardCatalogDb,
  templateId: string
) {
  const [row] = await db
    .select(publicCardColumns)
    .from(cardTemplate)
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(
      and(
        eq(cardTemplate.id, templateId),
        inArray(cardTemplate.lifecycle, ["active", "retired"])
      )
    )
    .limit(1);
  return row ? publicRow(row) : null;
}

export function shapePublicCardTemplate(
  input: Parameters<typeof publicRow>[0]
) {
  return publicRow(input);
}

export const listPublicCards = listPublishedCardTemplates;
export const getPublicCard = getPublishedCardTemplate;
