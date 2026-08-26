import {
  and,
  asc,
  cardCharacter,
  cardInstance,
  cardSeries,
  cardTemplate,
  eq,
  eterisWallet,
  media,
  packInstance,
  packOpening,
  packRevision,
  packTemplate,
  sql,
  user,
} from "@repo/db";
import type { db as database } from "@repo/db";
import { generateId } from "@repo/db/utils";
import {
  callerIdempotencyKeySchema,
  formatCardMintNumber,
  normalizeCollectiblePayload,
  packOpeningCardsSchema,
  packOpeningInputSchema,
  packOpeningCardSchema,
} from "@repo/shared/collectibles";
import type {
  CollectibleAssetReference,
  CollectibleErrorCode,
  PackOpeningCard,
  PackOpeningInput,
} from "@repo/shared/collectibles";
import z from "zod";

import { isUserBanActive } from "../utils/user-ban";
import { shapePublicCardTemplate } from "./card-catalog";
import { findActiveCollectibleCustody } from "./collectible-custody";
import type { CollectibleTransaction } from "./collectible-issuance";
import { appendCollectibleOwnershipEvent } from "./collectible-ownership";
import {
  assertCollectiblesMutationAllowed,
  withCollectibleDeadlockRetry,
} from "./collectibles";
import { createUserNotification } from "./notification";

type Database = typeof database;

export const packOpeningReadInputSchema = z
  .object({ packInstanceId: z.string().trim().min(1).max(200) })
  .strict();

export type PackOpeningErrorCode =
  | CollectibleErrorCode
  | "NOT_FOUND"
  | "INVALID_RESULT";

export class PackOpeningError extends Error {
  readonly code: PackOpeningErrorCode;

  constructor(code: PackOpeningErrorCode, message: string) {
    super(message);
    this.name = "PackOpeningError";
    this.code = code;
  }
}

export type PackOpeningCommittedResult = {
  cards: PackOpeningCard[];
  openedAt: Date;
  openingId: string;
  packInstanceId: string;
  replayed: boolean;
  revision: number;
  revisionId: string;
  source: string;
  templateId: string;
};

export type PrivatePackOpeningView = {
  assetObjectKey: string;
  cardCount: number;
  id: string;
  openedAt: Date | null;
  openingId: string | null;
  revision: number | null;
  revisionId: string;
  state: "opened" | "unopened";
  templateId: string;
  templateName: string;
  result: PackOpeningCard[] | null;
  source: string;
};

export type PackOpeningCustodyChecker = (
  tx: CollectibleTransaction,
  assets: readonly CollectibleAssetReference[]
) => Promise<boolean | readonly string[]> | boolean | readonly string[];

export type PackOpeningOptions = {
  activeCustody?: PackOpeningCustodyChecker;
  impersonated?: boolean;
  now?: Date;
};

type PackOpeningTransaction = CollectibleTransaction;

function openingFingerprint(userId: string, input: PackOpeningInput) {
  return normalizeCollectiblePayload({
    packInstanceId: input.packInstanceId,
    userId,
  });
}

function parseStoredCards(value: unknown): PackOpeningCard[] {
  const parsed = packOpeningCardsSchema.safeParse(value);
  if (!parsed.success) {
    throw new PackOpeningError(
      "INVALID_RESULT",
      "El resultado comprometido del Pack no es válido."
    );
  }
  return parsed.data;
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function replayResult(
  opening: typeof packOpening.$inferSelect,
  fingerprint: string
): PackOpeningCommittedResult {
  if (opening.fingerprint !== fingerprint) {
    throw new PackOpeningError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya fue usada con otro Pack."
    );
  }
  if (opening.revisionId === "" || opening.templateId === "") {
    throw new PackOpeningError(
      "INVALID_RESULT",
      "El resultado comprometido del Pack no tiene identidad histórica."
    );
  }
  return {
    cards: parseStoredCards(opening.cards),
    openedAt: asDate(opening.openedAt),
    openingId: opening.id,
    packInstanceId: opening.packInstanceId,
    replayed: true,
    // The revision number is filled by the caller when it has loaded the
    // immutable revision row. Stored rows retain the ID as the authority.
    revision: 0,
    revisionId: opening.revisionId,
    source: opening.source,
    templateId: opening.templateId,
  };
}

function withRevisionNumber(
  result: PackOpeningCommittedResult,
  revision: number | null
) {
  if (revision === null || revision < 1) {
    throw new PackOpeningError(
      "INVALID_RESULT",
      "La revisión histórica del Pack no es válida."
    );
  }
  return { ...result, revision };
}

function isActiveCustody(value: boolean | readonly string[] | undefined) {
  return value === true || (Array.isArray(value) && value.length > 0);
}

function uniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  return (
    candidate.code === "23505" &&
    candidate.constraint === "pack_opening_idempotency_key_unique"
  );
}

async function assertEligibleAccount(
  tx: PackOpeningTransaction,
  userId: string,
  now: Date
) {
  const [account] = await tx
    .select({
      banExpires: user.banExpires,
      banned: user.banned,
      emailVerified: user.emailVerified,
      id: user.id,
    })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  const [wallet] = await tx
    .select({ id: eterisWallet.id, status: eterisWallet.status })
    .from(eterisWallet)
    .where(eq(eterisWallet.userId, userId))
    .for("update");

  if (
    !account ||
    !account.emailVerified ||
    isUserBanActive(
      {
        banExpires: account.banExpires,
        banned: account.banned,
      },
      now
    ) ||
    (wallet && wallet.status !== "active")
  ) {
    throw new PackOpeningError(
      "ACCOUNT_INELIGIBLE",
      "Tu cuenta no puede abrir Packs en este momento."
    );
  }
}

function buildPublicOpeningCard(row: {
  availability: "active" | "frozen";
  binding: "transferable" | "account-bound";
  characterName: string;
  description: string;
  edition: string | null;
  gameName: string;
  id: string;
  lifetimeSupplyCeiling: number | null;
  mintNumber: number;
  presentationMetadata: unknown;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  renderedVariants: unknown;
  revealOrder: number | null;
  seriesName: string;
  templateId: string;
  templateAvailability: "active" | "disabled";
  ownerUserId: string | null;
}) {
  if (row.revealOrder === null || row.revealOrder < 1) {
    throw new PackOpeningError(
      "INVALID_RESULT",
      "Una carta comprometida no tiene un orden de revelado válido."
    );
  }
  const template = shapePublicCardTemplate({
    availability: row.templateAvailability,
    characterName: row.characterName,
    description: row.description,
    edition: row.edition,
    gameName: row.gameName,
    id: row.templateId,
    lifetimeSupplyCeiling: row.lifetimeSupplyCeiling,
    presentationMetadata: row.presentationMetadata,
    rarity: row.rarity,
    renderedVariants: row.renderedVariants,
    seriesName: row.seriesName,
  });
  return packOpeningCardSchema.parse({
    cardInstanceId: row.id,
    mintDisplay: formatCardMintNumber(
      row.mintNumber,
      row.lifetimeSupplyCeiling
    ),
    mintNumber: row.mintNumber,
    revealOrder: row.revealOrder,
    template,
  });
}

/**
 * Opens one Pack Instance inside a caller-owned transaction. This is the
 * application-service seam: routers authorize and validate, while this
 * function owns locks, invariant checks, transfer, history, and replay data.
 */
export async function openPackInTransaction(
  tx: PackOpeningTransaction,
  userId: string,
  input: PackOpeningInput,
  options: Pick<PackOpeningOptions, "activeCustody" | "now"> = {}
): Promise<PackOpeningCommittedResult> {
  const parsed = packOpeningInputSchema.parse(input);
  const now = options.now ?? new Date();
  const fingerprint = openingFingerprint(userId, parsed);

  const [existing] = await tx
    .select()
    .from(packOpening)
    .where(eq(packOpening.idempotencyKey, parsed.idempotencyKey))
    .for("update");
  if (existing) {
    const replay = replayResult(existing, fingerprint);
    const [revision] = await tx
      .select({ revision: packRevision.revision })
      .from(packRevision)
      .where(eq(packRevision.id, existing.revisionId))
      .for("update");
    return withRevisionNumber(replay, revision?.revision ?? null);
  }

  await assertEligibleAccount(tx, userId, now);

  const [pack] = await tx
    .select()
    .from(packInstance)
    .where(eq(packInstance.id, parsed.packInstanceId))
    .for("update");
  if (!pack) {
    throw new PackOpeningError("NOT_FOUND", "El Pack no existe.");
  }
  if (pack.ownerUserId !== userId) {
    throw new PackOpeningError(
      "OWNERSHIP_CHANGED",
      "Ya no eres propietario de este Pack."
    );
  }
  if (pack.state !== "unopened") {
    throw new PackOpeningError("ALREADY_OPENED", "Este Pack ya fue abierto.");
  }
  if (pack.availability !== "active") {
    throw new PackOpeningError(
      "UNAVAILABLE",
      "Este Pack está congelado y no puede abrirse."
    );
  }

  const [revision] = await tx
    .select()
    .from(packRevision)
    .where(eq(packRevision.id, pack.revisionId))
    .for("update");
  if (
    !revision ||
    revision.lifecycle !== "published" ||
    revision.availability !== "active"
  ) {
    throw new PackOpeningError(
      "UNAVAILABLE",
      "La revisión de este Pack no está disponible para abrirse."
    );
  }
  if (revision.revision === null || revision.templateId !== pack.templateId) {
    throw new PackOpeningError(
      "INVALID_RESULT",
      "La identidad histórica del Pack no coincide con su revisión."
    );
  }

  const rows = await tx
    .select({
      availability: cardInstance.availability,
      binding: cardInstance.binding,
      characterName: cardCharacter.characterName,
      description: cardTemplate.description,
      edition: cardTemplate.edition,
      gameName: cardCharacter.gameName,
      id: cardInstance.id,
      lifetimeSupplyCeiling: cardTemplate.lifetimeSupplyCeiling,
      mintNumber: cardInstance.mintNumber,
      presentationMetadata: cardTemplate.presentationMetadata,
      rarity: cardTemplate.rarity,
      renderedVariants: cardTemplate.renderedVariants,
      revealOrder: cardInstance.revealOrder,
      seriesName: cardSeries.name,
      templateId: cardTemplate.id,
      templateAvailability: cardTemplate.availability,
      ownerUserId: cardInstance.ownerUserId,
    })
    .from(cardInstance)
    .innerJoin(cardTemplate, eq(cardTemplate.id, cardInstance.templateId))
    .innerJoin(cardCharacter, eq(cardCharacter.id, cardTemplate.characterId))
    .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
    .where(eq(cardInstance.packInstanceId, pack.id))
    .orderBy(asc(cardInstance.id))
    .for("update");

  if (rows.length !== revision.cardCount || rows.length === 0) {
    throw new PackOpeningError(
      "INVALID_RESULT",
      "El contenido comprometido del Pack no coincide con su revisión."
    );
  }
  if (
    rows.some(
      (row) =>
        row.availability !== "active" ||
        row.ownerUserId !== null ||
        row.binding !== pack.binding
    )
  ) {
    throw new PackOpeningError(
      "UNAVAILABLE",
      "Una carta comprometida no está disponible para transferirse."
    );
  }

  const assets = [
    { assetId: pack.id, kind: "pack" as const },
    ...rows.map((row) => ({ assetId: row.id, kind: "card" as const })),
  ].toSorted((left, right) =>
    `${left.kind}:${left.assetId}`.localeCompare(
      `${right.kind}:${right.assetId}`
    )
  );
  let activeCustody: boolean | readonly string[];
  if (options.activeCustody) {
    activeCustody = await options.activeCustody(tx, assets);
  } else {
    const activeRows = await findActiveCollectibleCustody(tx, assets);
    activeCustody = activeRows.map(({ assetId }) => assetId);
  }
  if (isActiveCustody(activeCustody)) {
    throw new PackOpeningError(
      "ACTIVE_CUSTODY",
      "Este Pack o una de sus cartas está reservado por otra operación."
    );
  }

  const cards = rows
    .map((row) => buildPublicOpeningCard(row))
    .toSorted((left, right) => left.revealOrder - right.revealOrder);
  if (
    new Set(cards.map(({ revealOrder }) => revealOrder)).size !== cards.length
  ) {
    throw new PackOpeningError(
      "INVALID_RESULT",
      "El orden de revelado comprometido no es único."
    );
  }

  const openingId = generateId();
  await tx
    .update(cardInstance)
    .set({
      ownerUserId: userId,
      packInstanceId: null,
      revealOrder: null,
      updatedAt: now,
    })
    .where(eq(cardInstance.packInstanceId, pack.id));

  for (const card of cards) {
    await appendCollectibleOwnershipEvent(tx, {
      actorUserId: userId,
      cardInstanceId: card.cardInstanceId,
      fromUserId: null,
      kind: "opening",
      metadata: { revealOrder: card.revealOrder },
      sourceReference: pack.id,
      sourceType: "pack.open",
      toUserId: userId,
    });
  }
  await appendCollectibleOwnershipEvent(tx, {
    actorUserId: userId,
    fromUserId: userId,
    kind: "opening",
    metadata: { cardCount: cards.length },
    packInstanceId: pack.id,
    sourceReference: pack.id,
    sourceType: "pack.open",
    toUserId: userId,
  });
  await tx
    .update(packInstance)
    .set({ openedAt: now, state: "opened", updatedAt: now })
    .where(eq(packInstance.id, pack.id));
  await tx.insert(packOpening).values({
    cards,
    fingerprint,
    id: openingId,
    idempotencyKey: parsed.idempotencyKey,
    openedAt: now,
    ownerUserId: userId,
    packInstanceId: pack.id,
    revisionId: revision.id,
    source: pack.issueSource,
    templateId: pack.templateId,
  });

  return {
    cards,
    openedAt: now,
    openingId,
    packInstanceId: pack.id,
    replayed: false,
    revision: revision.revision,
    revisionId: revision.id,
    source: pack.issueSource,
    templateId: pack.templateId,
  };
}

/** Irreversible Pack opening command with post-commit notification delivery. */
export async function openPack(
  db: Database,
  userId: string,
  input: PackOpeningInput,
  options: PackOpeningOptions = {}
): Promise<PackOpeningCommittedResult> {
  assertCollectiblesMutationAllowed({ impersonated: options.impersonated });
  const parsed = packOpeningInputSchema.parse({
    idempotencyKey: callerIdempotencyKeySchema.parse(input.idempotencyKey),
    packInstanceId: input.packInstanceId,
  });
  let result: PackOpeningCommittedResult;
  try {
    result = await withCollectibleDeadlockRetry(
      () =>
        db.transaction(async (tx) => {
          await tx.execute(
            // Serialize a caller key before the Pack lock so competing
            // requests cannot turn the unique replay index into an opaque DB
            // error.
            // oxlint-disable-next-line no-unused-expressions
            sql`select pg_advisory_xact_lock(hashtextextended(${`pack-open:${parsed.idempotencyKey}`}, 0))`
          );
          return openPackInTransaction(tx, userId, parsed, {
            activeCustody: options.activeCustody,
            now: options.now,
          });
        }),
      { operation: "pack.open" }
    );
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new PackOpeningError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de idempotencia ya fue usada con otro Pack."
      );
    }
    throw error;
  }

  await deliverPackOpeningNotification(db, { ...result, userId }).catch(
    () => null
  );
  return result;
}

export function deliverPackOpeningNotification(
  db: Database,
  result: Pick<PackOpeningCommittedResult, "openingId" | "packInstanceId"> & {
    userId?: string;
  }
) {
  if (!result.userId) {
    return Promise.resolve(null);
  }
  return createUserNotification(db, {
    dedupeKey: `collectible-pack-open:${result.openingId}`,
    description: "La apertura quedó registrada en tu historial privado.",
    metadata: {
      category: "collectible_pack_opened",
      openingId: result.openingId,
    },
    targetUserId: result.userId,
    title: "Pack abierto",
  });
}

/** Retry a committed opening notice for the owner without re-opening the Pack. */
export async function retryPackOpeningNotification(
  db: Database,
  openingId: string,
  userId: string
) {
  assertCollectiblesMutationAllowed();
  const opening = await db.query.packOpening.findFirst({
    where: and(
      eq(packOpening.id, openingId),
      eq(packOpening.ownerUserId, userId)
    ),
  });
  if (!opening) {
    throw new PackOpeningError(
      "NOT_FOUND",
      "La apertura no existe o no pertenece a tu cuenta."
    );
  }
  return deliverPackOpeningNotification(db, {
    openingId: opening.id,
    packInstanceId: opening.packInstanceId,
    userId,
  });
}

async function privateOpeningQuery(
  db: Pick<Database, "select">,
  userId: string,
  packInstanceId: string
) {
  const [row] = await db
    .select({
      assetObjectKey: media.objectKey,
      cardCount: packRevision.cardCount,
      id: packInstance.id,
      openedAt: packInstance.openedAt,
      ownerUserId: packInstance.ownerUserId,
      revision: packRevision.revision,
      revisionId: packInstance.revisionId,
      source: packInstance.issueSource,
      state: packInstance.state,
      templateId: packInstance.templateId,
      templateName: packTemplate.name,
    })
    .from(packInstance)
    .innerJoin(packRevision, eq(packRevision.id, packInstance.revisionId))
    .innerJoin(packTemplate, eq(packTemplate.id, packInstance.templateId))
    .innerJoin(media, eq(media.id, packTemplate.assetMediaId))
    .where(
      and(
        eq(packInstance.id, packInstanceId),
        eq(packInstance.ownerUserId, userId)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Request-bound recovery read. Unopened Packs return metadata only; the
 * committed card result is selected only after the lifecycle is Opened.
 */
export async function getPrivatePackOpening(
  db: Database,
  userId: string,
  packInstanceId: string
): Promise<PrivatePackOpeningView | null> {
  const row = await privateOpeningQuery(db, userId, packInstanceId);
  if (!row || row.revision === null) {
    return null;
  }
  if (row.state === "unopened") {
    return {
      assetObjectKey: row.assetObjectKey,
      cardCount: row.cardCount,
      id: row.id,
      openedAt: null,
      openingId: null,
      revision: row.revision,
      revisionId: row.revisionId,
      result: null,
      source: row.source,
      state: "unopened",
      templateId: row.templateId,
      templateName: row.templateName,
    };
  }
  const [opening] = await db
    .select()
    .from(packOpening)
    .where(eq(packOpening.packInstanceId, row.id))
    .limit(1);
  if (!opening) {
    return null;
  }
  return {
    assetObjectKey: row.assetObjectKey,
    cardCount: row.cardCount,
    id: row.id,
    openedAt: row.openedAt,
    openingId: opening.id,
    revision: row.revision,
    revisionId: row.revisionId,
    result: parseStoredCards(opening.cards),
    source: row.source,
    state: "opened",
    templateId: opening.templateId,
    templateName: row.templateName,
  };
}
