import z from "zod";

import {
  protectedProcedure,
  publicProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import {
  getPublishedCardTemplate,
  listPublishedCardTemplates,
  publicCardCatalogQuerySchema,
} from "../services/card-catalog";
import {
  listPrivateCardInventory,
  listPrivateCollectibleProvenance,
  listPublicCardCollection,
  publicCardCollectionQuerySchema,
  privateCardInventoryQuerySchema,
  privateProvenanceQuerySchema,
} from "../services/collectible-inventory";

const idInput = z.object({ id: z.string().trim().min(1).max(200) }).strict();

const list = publicProcedure
  .use(slidingWindowRatelimitMiddleware(60, 60))
  .input(publicCardCatalogQuerySchema)
  .handler(({ context: { db }, input }) =>
    listPublishedCardTemplates(db, input)
  );

const detail = publicProcedure
  .use(slidingWindowRatelimitMiddleware(60, 60))
  .input(idInput)
  .handler(({ context: { db }, input }) =>
    getPublishedCardTemplate(db, input.id)
  );

const publicCollection = publicProcedure
  .use(slidingWindowRatelimitMiddleware(60, 60))
  .input(publicCardCollectionQuerySchema)
  .handler(({ context: { db, isSharedCacheContext }, input }) =>
    isSharedCacheContext
      ? ({ items: [], nextCursor: null, visible: false } as const)
      : listPublicCardCollection(db, input)
  );

const privateRead = protectedProcedure.use(
  slidingWindowRatelimitMiddleware(60, 60)
);

const inventory = privateRead
  .input(privateCardInventoryQuerySchema.optional())
  .handler(({ context: { db, session }, input }) =>
    listPrivateCardInventory(db, session.user.id, input ?? {})
  );

const provenance = privateRead
  .input(privateProvenanceQuerySchema)
  .handler(({ context: { db, session }, input }) =>
    listPrivateCollectibleProvenance(db, session.user.id, input)
  );

export default {
  catalog: {
    detail,
    list,
  },
  detail,
  get: detail,
  getById: detail,
  inventory,
  list,
  publicCollection,
  collection: publicCollection,
  private: {
    inventory,
    provenance,
  },
  provenance,
};
