import { packOpeningInputSchema } from "@repo/shared/collectibles";
import z from "zod";

import {
  collectiblesMutationMiddleware,
  protectedProcedure,
  publicProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import {
  listPrivateCollectibleProvenance,
  listPrivatePackInventory,
  listPrivatePackOpeningHistory,
  listPublicPackCollection,
  publicPackCollectionQuerySchema,
  privatePackInventoryQuerySchema,
  privateProvenanceQuerySchema,
} from "../services/collectible-inventory";
import {
  getPublishedPackTemplate,
  listPublishedPackTemplates,
} from "../services/pack-catalog";
import {
  getPrivatePackOpening,
  openPack,
  PackOpeningError,
  packOpeningReadInputSchema,
  retryPackOpeningNotification,
} from "../services/pack-opening";
import { translateDomainError } from "../utils/domain-errors";
import type { ProcedureErrors } from "../utils/domain-errors";

const idInput = z.object({ id: z.string().trim().min(1).max(200) }).strict();

const readProcedure = publicProcedure.use(
  slidingWindowRatelimitMiddleware(60, 60)
);

const list = readProcedure.handler(({ context: { db } }) =>
  listPublishedPackTemplates(db)
);

const detail = readProcedure
  .input(idInput)
  .handler(({ context: { db }, input }) =>
    getPublishedPackTemplate(db, input.id)
  );

const publicCollection = publicProcedure
  .use(slidingWindowRatelimitMiddleware(60, 60))
  .input(publicPackCollectionQuerySchema)
  .handler(({ context: { db, isSharedCacheContext }, input }) =>
    isSharedCacheContext
      ? ({ items: [], nextCursor: null, visible: false } as const)
      : listPublicPackCollection(db, input)
  );

const privateRead = protectedProcedure.use(
  slidingWindowRatelimitMiddleware(60, 60)
);

const mutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(5, 60));

function translateOpeningError(error: unknown, errors: ProcedureErrors): never {
  return translateDomainError(error, errors, {
    badRequestIncludesCode: true,
    // State conflicts surface as declared 409s instead of a BAD_REQUEST whose
    // only signal is a code prefix inside the message.
    conflictCodes: [
      "ACCOUNT_INELIGIBLE",
      "ACTIVE_CUSTODY",
      "ALREADY_OPENED",
      "IDEMPOTENCY_CONFLICT",
      "OWNERSHIP_CHANGED",
      "UNAVAILABLE",
    ],
    errorClass: PackOpeningError,
    notFoundCodes: ["NOT_FOUND"],
  });
}

const inventory = privateRead
  .input(privatePackInventoryQuerySchema.optional())
  .handler(({ context: { db, session }, input }) =>
    listPrivatePackInventory(db, session.user.id, input ?? {})
  );

const provenance = privateRead
  .input(privateProvenanceQuerySchema)
  .handler(({ context: { db, session }, input }) =>
    listPrivateCollectibleProvenance(db, session.user.id, input)
  );

const history = privateRead
  .input(privatePackInventoryQuerySchema.optional())
  .handler(({ context: { db, session }, input }) =>
    listPrivatePackOpeningHistory(db, session.user.id, input ?? {})
  );

const opening = privateRead
  .input(packOpeningReadInputSchema)
  .handler(({ context: { db, session }, input }) =>
    getPrivatePackOpening(db, session.user.id, input.packInstanceId)
  );

const open = mutation
  .input(packOpeningInputSchema)
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await openPack(db, session.user.id, input);
    } catch (error) {
      translateOpeningError(error, errors);
    }
  });

const retryNotification = mutation
  .input(z.object({ openingId: z.string().trim().min(1).max(200) }).strict())
  .handler(async ({ context: { db, session }, errors, input }) => {
    try {
      return await retryPackOpeningNotification(
        db,
        input.openingId,
        session.user.id
      );
    } catch (error) {
      translateOpeningError(error, errors);
    }
  });

export default {
  detail,
  get: detail,
  history,
  inventory,
  list,
  publicCollection,
  open,
  opening,
  provenance,
  retryNotification,
};
