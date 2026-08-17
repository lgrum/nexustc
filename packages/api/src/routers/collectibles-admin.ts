import { asc, desc, eq } from "@repo/db";
import {
  cardCharacter,
  cardSeries,
  cardTemplate,
  collectibleGrantCampaign,
  media,
} from "@repo/db/schema/app";
import {
  cardEffectConfigSchema,
  cardPresentationMetadataSchema,
  collectibleBindingSchema,
  officialCardShopOfferDraftSchema,
} from "@repo/shared/collectibles";
import z from "zod";

import {
  collectiblesMutationMiddleware,
  permissionProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import {
  cardCharacterInputSchema,
  cardSeriesInputSchema,
  cardTemplateDeferredDraftInputSchema,
  CardAuthoringError,
  changeCardTemplateLifecycle,
  correctCardTemplatePresentation,
  createCardCharacter,
  createCardSeries,
  publishCardTemplate,
  retireCardCharacter,
  retireCardSeries,
  saveCardTemplateDraftWithPortrait,
  updateCardCharacter,
  updateCardSeries,
} from "../services/card-authoring";
import {
  COLLECTIBLE_ADMIN_ACTIONS,
  COLLECTIBLE_ADMIN_TARGETS,
  listCollectibleAdminActions,
} from "../services/collectible-admin-action";
import {
  CollectibleCorrectionError,
  grantExceptionalCard,
  reverseExceptionalEteris,
  transferExceptionalCollectible,
} from "../services/collectible-correction";
import {
  CollectibleGrantCampaignError,
  collectibleGrantCampaignInputSchema,
  collectibleGrantExecutionInputSchema,
  createCollectibleGrantCampaign,
  executeCollectibleGrantCampaign,
  retryCollectibleGrantNotification,
} from "../services/collectible-grant-campaign";
import { CollectibleIssuanceError } from "../services/collectible-issuance";
import {
  CollectibleModerationError,
  changeCardTemplateAvailability,
  changeGachaponMachineAvailability,
  changePackRevisionAvailability,
  changeShopOfferAvailability,
  freezeCardInstance,
  freezePackInstance,
  restoreCardInstance,
  restorePackInstance,
} from "../services/collectible-moderation";
import { getCollectibleOperationalMetrics } from "../services/economy-report";
import {
  administrativelyCancelGiftOffer,
  GiftOfferError,
} from "../services/gift-offer";
import {
  createOfficialCardShopOffer,
  disableOfficialCardShopOffer,
  enableOfficialCardShopOffer,
  getOfficialCardShopOfferImpact,
  listOfficialCardShopOffersForAdmin,
  OfficialCardShopError,
  reduceOfficialCardShopOfferQuota,
  restockOfficialCardShopOffer,
  updateOfficialCardShopOffer,
} from "../services/official-card-shop";
import {
  PackAuthoringError,
  createPackTemplate,
  getPackRevisionDraft,
  inspectPackRevisionProbabilities,
  listPackRevisions,
  listPackTemplates,
  previewPackRevisionPublicationImpact,
  publishPackRevision,
  retirePackTemplate,
  savePackRevisionDraft,
  savePackTemplateDraft,
  simulatePackRevisionDraft,
  validatePackRevisionDraft,
  packRevisionInputSchema,
  packTemplateInputSchema,
} from "../services/pack-authoring";
import {
  administrativelyCancelTradeOffer,
  TradeOfferError,
} from "../services/trade-offer";
import { requiredSingleDeferredMediaSelectionInputSchema } from "../utils/deferred-media";
import gacha from "./gacha";

const expectedVersionSchema = z.number().int().positive();
const reasonSchema = z.string().trim().min(3).max(500);
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const moderationCustodySchema = z.enum(["retain", "release"]).default("retain");

const mutationProcedure = permissionProcedure({ cards: ["manage"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(20, 60));
const publicationProcedure = permissionProcedure({ cards: ["publish"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(10, 60));
const freezeProcedure = permissionProcedure({ cards: ["freeze"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(10, 60));
const correctionProcedure = permissionProcedure({ collectibles: ["correct"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(5, 60));
const packMutationProcedure = permissionProcedure({ packs: ["manage"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(20, 60));
const packPublicationProcedure = permissionProcedure({ packs: ["publish"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(10, 60));
const grantProcedure = permissionProcedure({ cards: ["grant"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(20, 60));
const shopViewProcedure = permissionProcedure({ cardShop: ["view"] });
const shopMutationProcedure = permissionProcedure({ cardShop: ["manage"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(20, 60));

function translateCardError(
  error: unknown,
  errors: Parameters<
    Parameters<typeof mutationProcedure.handler>[0]
  >[0]["errors"]
): never {
  if (!(error instanceof CardAuthoringError)) {
    throw error;
  }
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (error.code === "CONFLICT") {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  throw errors.BAD_REQUEST({
    data: error.fieldErrors,
    message: error.message,
  });
}

function translatePackError(
  error: unknown,
  errors: Parameters<
    Parameters<typeof mutationProcedure.handler>[0]
  >[0]["errors"]
): never {
  if (!(error instanceof PackAuthoringError)) {
    throw error;
  }
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (error.code === "CONFLICT") {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  throw errors.BAD_REQUEST({
    data: error.fieldErrors,
    message: error.message,
  });
}

function translateGrantError(
  error: unknown,
  errors: Parameters<
    Parameters<typeof mutationProcedure.handler>[0]
  >[0]["errors"]
): never {
  if (error instanceof CollectibleIssuanceError) {
    throw errors.BAD_REQUEST({ message: error.message });
  }
  if (!(error instanceof CollectibleGrantCampaignError)) {
    throw error;
  }
  if (error.code === "CAMPAIGN_NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (error.code === "IDEMPOTENCY_CONFLICT") {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

function translateShopError(
  error: unknown,
  errors: Parameters<
    Parameters<typeof shopMutationProcedure.handler>[0]
  >[0]["errors"]
): never {
  if (!(error instanceof OfficialCardShopError)) {
    throw error;
  }
  if (error.code === "STALE_VERSION" || error.code === "IDEMPOTENCY_CONFLICT") {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  if (error.code === "OFFER_UNAVAILABLE") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

function translateModerationError(
  error: unknown,
  errors: Parameters<Parameters<typeof freezeProcedure.handler>[0]>[0]["errors"]
): never {
  if (!(error instanceof CollectibleModerationError)) {
    throw error;
  }
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (error.code === "STALE_VERSION" || error.code === "IDEMPOTENCY_CONFLICT") {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

function translateTradeAdminError(
  error: unknown,
  errors: Parameters<Parameters<typeof freezeProcedure.handler>[0]>[0]["errors"]
): never {
  if (!(error instanceof TradeOfferError)) {
    throw error;
  }
  if (error.code === "OFFER_NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (error.code === "STALE_VERSION" || error.code === "IDEMPOTENCY_CONFLICT") {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

function translateGiftAdminError(
  error: unknown,
  errors: Parameters<Parameters<typeof freezeProcedure.handler>[0]>[0]["errors"]
): never {
  if (!(error instanceof GiftOfferError)) {
    throw error;
  }
  if (error.code === "OFFER_NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (error.code === "STALE_VERSION" || error.code === "IDEMPOTENCY_CONFLICT") {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

function translateCorrectionError(
  error: unknown,
  errors: Parameters<
    Parameters<typeof correctionProcedure.handler>[0]
  >[0]["errors"]
): never {
  if (!(error instanceof CollectibleCorrectionError)) {
    throw error;
  }
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  if (
    error.code === "STALE_VERSION" ||
    error.code === "IDEMPOTENCY_CONFLICT" ||
    error.code === "OWNERSHIP_CHANGED"
  ) {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

const templateDraftInput = z
  .object({
    draft: cardTemplateDeferredDraftInputSchema,
    expectedVersion: expectedVersionSchema.optional(),
    portraitSelection: requiredSingleDeferredMediaSelectionInputSchema,
  })
  .strict();

const assetModerationInput = z
  .object({
    assetId: z.string().trim().min(1),
    custody: moderationCustodySchema,
    expectedVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    reason: reasonSchema,
  })
  .strict();

const revisionModerationInput = z
  .object({
    expectedVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    reason: reasonSchema,
    revisionId: z.string().trim().min(1),
  })
  .strict();

const templateModerationInput = z
  .object({
    expectedVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    reason: reasonSchema,
    templateId: z.string().trim().min(1),
  })
  .strict();

const offerModerationInput = z
  .object({
    expectedVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    offerId: z.string().trim().min(1),
    reason: reasonSchema,
  })
  .strict();

const machineModerationInput = z
  .object({
    expectedVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    machineId: z.string().trim().min(1),
    reason: reasonSchema,
  })
  .strict();

const administrativeCloseInput = z
  .object({
    expectedVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    offerId: z.string().trim().min(1),
    reason: reasonSchema,
  })
  .strict();

const administrativeGiftCloseInput = z
  .object({
    expectedVersion: expectedVersionSchema,
    giftId: z.string().trim().min(1),
    idempotencyKey: idempotencyKeySchema,
    reason: reasonSchema,
  })
  .strict();

const exceptionalGrantInput = z
  .object({
    binding: collectibleBindingSchema,
    expectedVersion: expectedVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    reason: reasonSchema,
    targetUserId: z.string().trim().min(1),
    templateId: z.string().trim().min(1),
  })
  .strict();

const exceptionalTransferInput = z
  .object({
    assetId: z.string().trim().min(1),
    expectedVersion: expectedVersionSchema,
    fromUserId: z.string().trim().min(1),
    idempotencyKey: idempotencyKeySchema,
    kind: z.enum(["card", "pack"]),
    reason: reasonSchema,
    toUserId: z.string().trim().min(1),
  })
  .strict();

const exceptionalEterisReversalInput = z
  .object({
    expectedSequence: z.string().trim().regex(/^\d+$/),
    failureCode: z.enum([
      "platform-timeout",
      "settlement-failure",
      "duplicate-attempt",
    ]),
    idempotencyKey: idempotencyKeySchema,
    reason: reasonSchema,
    transactionId: z.string().trim().min(1),
    verifiedFailure: z.literal(true),
  })
  .strict();

const moderationProcedures = {
  cardInstances: {
    freeze: freezeProcedure
      .input(assetModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await freezeCardInstance(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    restore: freezeProcedure
      .input(assetModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await restoreCardInstance(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
  },
  packInstances: {
    freeze: freezeProcedure
      .input(assetModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await freezePackInstance(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    restore: freezeProcedure
      .input(assetModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await restorePackInstance(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
  },
  revisions: {
    disable: freezeProcedure
      .input(revisionModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changePackRevisionAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "disable"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    restore: freezeProcedure
      .input(revisionModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changePackRevisionAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "restore"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
  },
  templates: {
    disable: freezeProcedure
      .input(templateModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeCardTemplateAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "disable"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    restore: freezeProcedure
      .input(templateModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeCardTemplateAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "restore"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
  },
  shopOffers: {
    disable: freezeProcedure
      .input(offerModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeShopOfferAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "disable"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    restore: freezeProcedure
      .input(offerModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeShopOfferAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "restore"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
  },
  gachapon: {
    pause: freezeProcedure
      .input(machineModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeGachaponMachineAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "pause"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    restore: freezeProcedure
      .input(machineModerationInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeGachaponMachineAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "restore"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
  },
} as const;

const administrativeOfferProcedures = {
  gifts: {
    cancel: permissionProcedure({ marketplace: ["moderate"] })
      .use(collectiblesMutationMiddleware)
      .use(slidingWindowRatelimitMiddleware(10, 60))
      .input(administrativeGiftCloseInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await administrativelyCancelGiftOffer(
            db,
            session.user.id,
            input
          );
        } catch (error) {
          translateGiftAdminError(error, errors);
        }
      }),
  },
  trades: {
    cancel: permissionProcedure({ trades: ["moderate"] })
      .use(collectiblesMutationMiddleware)
      .use(slidingWindowRatelimitMiddleware(10, 60))
      .input(administrativeCloseInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await administrativelyCancelTradeOffer(
            db,
            session.user.id,
            input
          );
        } catch (error) {
          translateTradeAdminError(error, errors);
        }
      }),
  },
} as const;

const correctionProcedures = {
  exceptionalGrant: correctionProcedure
    .input(exceptionalGrantInput)
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await grantExceptionalCard(db, {
          ...input,
          actorUserId: session.user.id,
        });
      } catch (error) {
        translateCorrectionError(error, errors);
      }
    }),
  exceptionalTransfer: correctionProcedure
    .input(exceptionalTransferInput)
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await transferExceptionalCollectible(db, {
          ...input,
          actorUserId: session.user.id,
        });
      } catch (error) {
        translateCorrectionError(error, errors);
      }
    }),
  reverseEteris: permissionProcedure({ economy: ["adjust"] })
    .use(collectiblesMutationMiddleware)
    .use(slidingWindowRatelimitMiddleware(5, 60))
    .input(exceptionalEterisReversalInput)
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await reverseExceptionalEteris(db, {
          ...input,
          actorUserId: session.user.id,
        });
      } catch (error) {
        translateCorrectionError(error, errors);
      }
    }),
} as const;

const operationalProcedures = {
  metrics: permissionProcedure({ economy: ["view"] })
    .use(slidingWindowRatelimitMiddleware(30, 60))
    .handler(({ context: { db } }) => getCollectibleOperationalMetrics(db)),
} as const;

export default {
  gacha: gacha.admin,
  freezes: moderationProcedures,
  moderation: moderationProcedures,
  offers: administrativeOfferProcedures,
  corrections: correctionProcedures,
  operations: operationalProcedures,
  shop: {
    create: shopMutationProcedure
      .input(
        officialCardShopOfferDraftSchema.and(
          z.object({
            enabled: z.boolean().optional(),
            reason: reasonSchema,
          })
        )
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await createOfficialCardShopOffer(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateShopError(error, errors);
        }
      }),
    disable: shopMutationProcedure
      .input(
        z
          .object({
            expectedVersion: expectedVersionSchema,
            offerId: z.string().trim().min(1),
            reason: reasonSchema,
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await disableOfficialCardShopOffer(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateShopError(error, errors);
        }
      }),
    enable: shopMutationProcedure
      .input(
        z
          .object({
            expectedVersion: expectedVersionSchema,
            offerId: z.string().trim().min(1),
            reason: reasonSchema,
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await enableOfficialCardShopOffer(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateShopError(error, errors);
        }
      }),
    freeze: moderationProcedures.shopOffers.disable,
    impact: shopViewProcedure
      .input(z.object({ offerId: z.string().trim().min(1) }).strict())
      .handler(({ context: { db }, input }) =>
        getOfficialCardShopOfferImpact(db, input.offerId)
      ),
    list: shopViewProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(100).default(100) })
          .optional()
      )
      .handler(({ context: { db }, input }) =>
        listOfficialCardShopOffersForAdmin(db, input?.limit)
      ),
    reduceQuota: shopMutationProcedure
      .input(
        z
          .object({
            amount: z.number().int().positive().max(1_000_000),
            expectedVersion: expectedVersionSchema,
            offerId: z.string().trim().min(1),
            reason: reasonSchema,
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await reduceOfficialCardShopOfferQuota(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateShopError(error, errors);
        }
      }),
    restock: shopMutationProcedure
      .input(
        z
          .object({
            amount: z.number().int().positive().max(1_000_000),
            expectedVersion: expectedVersionSchema,
            offerId: z.string().trim().min(1),
            reason: reasonSchema,
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await restockOfficialCardShopOffer(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateShopError(error, errors);
        }
      }),
    restore: moderationProcedures.shopOffers.restore,
    update: shopMutationProcedure
      .input(
        officialCardShopOfferDraftSchema.and(
          z.object({
            enabled: z.boolean().optional(),
            expectedVersion: expectedVersionSchema,
            offerId: z.string().trim().min(1),
            reason: reasonSchema,
          })
        )
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await updateOfficialCardShopOffer(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateShopError(error, errors);
        }
      }),
  },
  characters: {
    create: mutationProcedure
      .input(cardCharacterInputSchema)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await createCardCharacter(db, session.user.id, input);
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
    list: permissionProcedure({ cards: ["view"] })
      .input(
        z.object({ search: z.string().trim().max(160).optional() }).optional()
      )
      .handler(({ context: { db }, input }) =>
        db
          .select()
          .from(cardCharacter)
          .where(
            input?.search
              ? eq(
                  cardCharacter.normalizedCharacterName,
                  input.search.toLowerCase()
                )
              : undefined
          )
          .orderBy(
            asc(cardCharacter.gameName),
            asc(cardCharacter.characterName)
          )
      ),
    retire: mutationProcedure
      .input(
        z
          .object({
            characterId: z.string().trim().min(1),
            expectedVersion: z.coerce.date(),
            reason: reasonSchema,
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await retireCardCharacter(
            db,
            session.user.id,
            input.characterId,
            input
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
    update: mutationProcedure
      .input(
        z
          .object({
            characterId: z.string().trim().min(1),
            draft: cardCharacterInputSchema,
            expectedVersion: z.coerce.date(),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await updateCardCharacter(
            db,
            session.user.id,
            input.characterId,
            input.draft,
            input.expectedVersion
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
  },
  audit: {
    list: permissionProcedure({ collectibles: ["audit"] })
      .input(
        z
          .object({
            action: z.enum(COLLECTIBLE_ADMIN_ACTIONS).optional(),
            cursor: z.string().trim().min(1).optional(),
            limit: z.number().int().min(1).max(100).default(50),
            targetId: z.string().trim().min(1).optional(),
            targetKind: z.enum(COLLECTIBLE_ADMIN_TARGETS).optional(),
            templateId: z.string().trim().min(1).optional(),
          })
          .optional()
      )
      .handler(({ context: { db }, input }) =>
        listCollectibleAdminActions(db, {
          action: input?.action,
          cursor: input?.cursor,
          limit: input?.limit,
          targetId: input?.targetId ?? input?.templateId,
          targetKind:
            input?.targetKind ??
            (input?.templateId ? "card-template" : undefined),
        })
      ),
  },
  grants: {
    campaigns: {
      create: grantProcedure
        .input(collectibleGrantCampaignInputSchema)
        .handler(async ({ context: { db, session }, errors, input }) => {
          try {
            return await createCollectibleGrantCampaign(
              db,
              session.user.id,
              input
            );
          } catch (error) {
            translateGrantError(error, errors);
          }
        }),
      list: permissionProcedure({ cards: ["grant"] }).handler(
        ({ context: { db } }) =>
          db
            .select()
            .from(collectibleGrantCampaign)
            .orderBy(desc(collectibleGrantCampaign.createdAt))
      ),
    },
    execute: grantProcedure
      .input(collectibleGrantExecutionInputSchema)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await executeCollectibleGrantCampaign(
            db,
            session.user.id,
            input
          );
        } catch (error) {
          translateGrantError(error, errors);
        }
      }),
    retryNotification: grantProcedure
      .input(z.object({ executionId: z.string().trim().min(1) }).strict())
      .handler(async ({ context: { db }, errors, input }) => {
        try {
          return await retryCollectibleGrantNotification(db, input.executionId);
        } catch (error) {
          translateGrantError(error, errors);
        }
      }),
  },
  packs: {
    revisions: {
      disable: moderationProcedures.revisions.disable,
      get: permissionProcedure({ packs: ["view"] })
        .input(z.object({ revisionId: z.string().trim().min(1) }).strict())
        .handler(({ context: { db }, input }) =>
          getPackRevisionDraft(db, input.revisionId)
        ),
      list: permissionProcedure({ packs: ["view"] })
        .input(z.object({ templateId: z.string().trim().min(1) }).strict())
        .handler(({ context: { db }, input }) =>
          listPackRevisions(db, input.templateId)
        ),
      preview: permissionProcedure({ packs: ["publish"] })
        .use(slidingWindowRatelimitMiddleware(20, 60))
        .input(
          z
            .object({
              revisionId: z.string().trim().min(1),
              templateId: z.string().trim().min(1),
            })
            .strict()
        )
        .handler(async ({ context: { db }, errors, input }) => {
          try {
            return await previewPackRevisionPublicationImpact(
              db,
              input.templateId,
              input.revisionId
            );
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
      publish: packPublicationProcedure
        .input(
          z
            .object({
              confirm: z.boolean().optional(),
              confirmation: z.boolean().optional(),
              expectedRevisionVersion: expectedVersionSchema.optional(),
              expectedTemplateVersion: expectedVersionSchema.optional(),
              expectedVersion: expectedVersionSchema.optional(),
              reason: z.string().trim().max(500).optional(),
              revisionId: z.string().trim().min(1),
              templateId: z.string().trim().min(1),
            })
            .strict()
            .refine(
              ({
                expectedRevisionVersion,
                expectedTemplateVersion,
                expectedVersion,
              }) =>
                expectedVersion !== undefined ||
                (expectedRevisionVersion !== undefined &&
                  expectedTemplateVersion !== undefined),
              "Confirma las versiones actuales antes de publicar."
            )
        )
        .handler(async ({ context: { db, session }, errors, input }) => {
          try {
            return await publishPackRevision(
              db,
              session.user.id,
              input.templateId,
              input
            );
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
      restore: moderationProcedures.revisions.restore,
      saveDraft: packMutationProcedure
        .input(
          z
            .object({
              draft: packRevisionInputSchema,
              expectedVersion: expectedVersionSchema.optional(),
              templateId: z.string().trim().min(1),
            })
            .strict()
        )
        .handler(async ({ context: { db, session }, errors, input }) => {
          try {
            return await savePackRevisionDraft(
              db,
              session.user.id,
              input.templateId,
              input.draft,
              input.expectedVersion
            );
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
      simulate: permissionProcedure({ packs: ["manage"] })
        .use(slidingWindowRatelimitMiddleware(10, 60))
        .input(
          z
            .object({
              iterations: z.number().int().min(1).max(100_000).default(1000),
              revisionId: z.string().trim().min(1),
            })
            .strict()
        )
        .handler(async ({ context: { db }, errors, input }) => {
          try {
            return await simulatePackRevisionDraft(db, input.revisionId, {
              iterations: input.iterations,
            });
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
      probabilities: permissionProcedure({ packs: ["manage"] })
        .use(slidingWindowRatelimitMiddleware(20, 60))
        .input(z.object({ revisionId: z.string().trim().min(1) }).strict())
        .handler(async ({ context: { db }, errors, input }) => {
          try {
            return await inspectPackRevisionProbabilities(db, input.revisionId);
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
      validate: permissionProcedure({ packs: ["manage"] })
        .use(slidingWindowRatelimitMiddleware(20, 60))
        .input(z.object({ revisionId: z.string().trim().min(1) }).strict())
        .handler(async ({ context: { db }, errors, input }) => {
          try {
            return await validatePackRevisionDraft(db, input.revisionId);
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
    },
    templates: {
      create: packMutationProcedure
        .input(packTemplateInputSchema)
        .handler(async ({ context: { db, session }, errors, input }) => {
          try {
            return await createPackTemplate(db, session.user.id, input);
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
      list: permissionProcedure({ packs: ["view"] }).handler(
        ({ context: { db } }) => listPackTemplates(db)
      ),
      retire: packMutationProcedure
        .input(
          z
            .object({
              expectedVersion: expectedVersionSchema,
              reason: reasonSchema,
              templateId: z.string().trim().min(1),
            })
            .strict()
        )
        .handler(async ({ context: { db, session }, errors, input }) => {
          try {
            return await retirePackTemplate(
              db,
              session.user.id,
              input.templateId,
              input
            );
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
      saveDraft: packMutationProcedure
        .input(
          z
            .object({
              draft: packTemplateInputSchema,
              expectedVersion: expectedVersionSchema.optional(),
            })
            .strict()
        )
        .handler(async ({ context: { db, session }, errors, input }) => {
          try {
            return await savePackTemplateDraft(
              db,
              session.user.id,
              input.draft,
              input.expectedVersion
            );
          } catch (error) {
            translatePackError(error, errors);
          }
        }),
    },
  },
  series: {
    create: mutationProcedure
      .input(cardSeriesInputSchema)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await createCardSeries(db, session.user.id, input);
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
    list: permissionProcedure({ cards: ["view"] }).handler(
      ({ context: { db } }) =>
        db.select().from(cardSeries).orderBy(asc(cardSeries.name))
    ),
    retire: mutationProcedure
      .input(
        z
          .object({
            expectedVersion: z.coerce.date(),
            reason: reasonSchema,
            seriesId: z.string().trim().min(1),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await retireCardSeries(
            db,
            session.user.id,
            input.seriesId,
            input
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
    update: mutationProcedure
      .input(
        z
          .object({
            draft: cardSeriesInputSchema,
            expectedVersion: z.coerce.date(),
            seriesId: z.string().trim().min(1),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await updateCardSeries(
            db,
            session.user.id,
            input.seriesId,
            input.draft,
            input.expectedVersion
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
  },
  templates: {
    correct: correctionProcedure
      .input(
        z
          .object({
            description: z.string().trim().max(2000),
            effect: cardEffectConfigSchema,
            expectedVersion: expectedVersionSchema,
            portraitMediaId: z.string().trim().min(1),
            presentation: cardPresentationMetadataSchema,
            reason: reasonSchema,
            templateId: z.string().trim().min(1),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await correctCardTemplatePresentation(
            db,
            session.user.id,
            input.templateId,
            input
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
    disable: freezeProcedure
      .input(
        z
          .object({
            expectedVersion: expectedVersionSchema,
            idempotencyKey: idempotencyKeySchema,
            reason: reasonSchema,
            templateId: z.string().trim().min(1),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeCardTemplateAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "disable"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    list: permissionProcedure({ cards: ["view"] })
      .input(
        z
          .object({ limit: z.number().int().min(1).max(100).default(100) })
          .optional()
      )
      .handler(({ context: { db }, input }) =>
        db
          .select({
            availability: cardTemplate.availability,
            characterId: cardTemplate.characterId,
            characterName: cardCharacter.characterName,
            description: cardTemplate.description,
            edition: cardTemplate.edition,
            effectConfig: cardTemplate.effectConfig,
            gameName: cardCharacter.gameName,
            id: cardTemplate.id,
            lifetimeSupplyCeiling: cardTemplate.lifetimeSupplyCeiling,
            lifecycle: cardTemplate.lifecycle,
            mintedSupply: cardTemplate.mintedSupply,
            portraitMediaId: cardTemplate.portraitMediaId,
            portraitObjectKey: media.objectKey,
            presentationMetadata: cardTemplate.presentationMetadata,
            rarity: cardTemplate.rarity,
            seriesId: cardTemplate.seriesId,
            seriesName: cardSeries.name,
            updatedAt: cardTemplate.updatedAt,
            version: cardTemplate.version,
          })
          .from(cardTemplate)
          .innerJoin(
            cardCharacter,
            eq(cardCharacter.id, cardTemplate.characterId)
          )
          .innerJoin(cardSeries, eq(cardSeries.id, cardTemplate.seriesId))
          .innerJoin(media, eq(media.id, cardTemplate.portraitMediaId))
          .orderBy(desc(cardTemplate.updatedAt))
          .limit(input?.limit ?? 100)
      ),
    publish: publicationProcedure
      .input(
        z
          .object({
            expectedVersion: expectedVersionSchema,
            reason: z.string().trim().max(500).optional(),
            templateId: z.string().trim().min(1),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await publishCardTemplate(
            db,
            session.user.id,
            input.templateId,
            input
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
    restore: freezeProcedure
      .input(
        z
          .object({
            expectedVersion: expectedVersionSchema,
            idempotencyKey: idempotencyKeySchema,
            reason: reasonSchema,
            templateId: z.string().trim().min(1),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeCardTemplateAvailability(
            db,
            { ...input, actorUserId: session.user.id },
            "restore"
          );
        } catch (error) {
          translateModerationError(error, errors);
        }
      }),
    retire: freezeProcedure
      .input(
        z
          .object({
            expectedVersion: expectedVersionSchema,
            reason: reasonSchema,
            templateId: z.string().trim().min(1),
          })
          .strict()
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await changeCardTemplateLifecycle(
            db,
            session.user.id,
            input.templateId,
            "retire",
            input
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
    saveDraft: mutationProcedure
      .input(templateDraftInput)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await saveCardTemplateDraftWithPortrait(
            db,
            session.user.id,
            input.draft,
            input.portraitSelection,
            input.expectedVersion
          );
        } catch (error) {
          translateCardError(error, errors);
        }
      }),
  },
};
