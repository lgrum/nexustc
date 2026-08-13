import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import {
  PROFILE_LAYOUT_KEYS,
  PROFILE_SHOWCASE_TYPE_KEYS,
} from "@repo/shared/profile-customization";
import z from "zod";

import { ownerProcedure } from "../index";
import {
  grantProfileCatalogItem,
  ProfileCatalogGrantError,
  revokeProfileCatalogGrant,
} from "../services/profile-catalog-grant";
import {
  changeProfileCatalogLifecycle,
  deleteProfileCatalogDraft,
  ProfileCatalogLifecycleError,
  rollbackProfileCatalogRevision,
} from "../services/profile-catalog-lifecycle";
import {
  correctProfileCatalogPurchase,
  ProfileCatalogPurchaseCorrectionError,
} from "../services/profile-catalog-purchase-correction";
import {
  listOwnerProfileDecorations,
  ProfileDecorationCatalogError,
  publishProfileDecorationDraft,
  saveProfileDecorationDraft,
} from "../services/profile-decoration-catalog";
import {
  ProfileEntitlementAdminError,
  publishProfileLayoutRequirement,
  publishProfileShowcaseRequirement,
} from "../services/profile-entitlement-admin";
import {
  listOwnerProfileSkins,
  ProfileSkinCatalogError,
  publishProfileSkinDraft,
  saveProfileSkinDraft,
} from "../services/profile-skin-catalog";

function translateCatalogError(
  error: unknown,
  errors: Parameters<Parameters<typeof ownerProcedure.handler>[0]>[0]["errors"]
) {
  if (!(error instanceof ProfileSkinCatalogError)) {
    throw error;
  }
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  throw errors.BAD_REQUEST({
    data: { fieldErrors: error.fieldErrors },
    message: error.message,
  });
}

function translateDecorationError(
  error: unknown,
  errors: Parameters<Parameters<typeof ownerProcedure.handler>[0]>[0]["errors"]
) {
  if (!(error instanceof ProfileDecorationCatalogError)) {
    throw error;
  }
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  throw errors.BAD_REQUEST({
    data: { fieldErrors: error.fieldErrors },
    message: error.message,
  });
}

function translateLifecycleError(
  error: unknown,
  errors: Parameters<Parameters<typeof ownerProcedure.handler>[0]>[0]["errors"]
) {
  if (!(error instanceof ProfileCatalogLifecycleError)) {
    throw error;
  }
  if (error.code === "NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

function translateGrantError(
  error: unknown,
  errors: Parameters<Parameters<typeof ownerProcedure.handler>[0]>[0]["errors"]
) {
  if (!(error instanceof ProfileCatalogGrantError)) {
    throw error;
  }
  if (error.code === "GRANT_NOT_FOUND" || error.code === "USER_NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

function translatePurchaseCorrectionError(
  error: unknown,
  errors: Parameters<Parameters<typeof ownerProcedure.handler>[0]>[0]["errors"]
) {
  if (!(error instanceof ProfileCatalogPurchaseCorrectionError)) {
    throw error;
  }
  if (error.code === "PURCHASE_NOT_FOUND") {
    throw errors.NOT_FOUND({ message: error.message });
  }
  throw errors.BAD_REQUEST({ message: error.message });
}

const supportReasonSchema = z.string().trim().min(3).max(500);

function rejectImpersonation(
  session: { session?: { impersonatedBy?: string | null } | null },
  errors: Parameters<Parameters<typeof ownerProcedure.handler>[0]>[0]["errors"]
) {
  if (session.session?.impersonatedBy) {
    throw errors.FORBIDDEN({
      message:
        "No puedes administrar el catálogo mientras suplantes una cuenta.",
    });
  }
}

export default {
  purchases: {
    correct: ownerProcedure
      .input(
        z.object({
          purchaseTransactionId: z.string().trim().min(1).max(128),
          reason: supportReasonSchema,
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await correctProfileCatalogPurchase(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translatePurchaseCorrectionError(error, errors);
        }
      }),
  },
  grants: {
    grant: ownerProcedure
      .input(
        z.object({
          itemId: z.string().trim().min(1).max(128),
          reason: supportReasonSchema,
          sourceReference: z.string().trim().min(1).max(200),
          userId: z.string().trim().min(1).max(128),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await grantProfileCatalogItem(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateGrantError(error, errors);
        }
      }),
    revoke: ownerProcedure
      .input(
        z.object({
          grantId: z.string().trim().min(1).max(128),
          reason: supportReasonSchema,
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await revokeProfileCatalogGrant(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateGrantError(error, errors);
        }
      }),
  },
  lifecycle: {
    archive: ownerProcedure
      .input(
        z.object({
          itemId: z.string().min(1),
          reason: z.string().trim().min(3).max(500),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await changeProfileCatalogLifecycle(
            db,
            session.user.id,
            input.itemId,
            "archive",
            input.reason
          );
        } catch (error) {
          translateLifecycleError(error, errors);
        }
      }),
    deleteDraft: ownerProcedure
      .input(
        z.object({
          itemId: z.string().min(1),
          reason: z.string().trim().min(3).max(500),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await deleteProfileCatalogDraft(
            db,
            session.user.id,
            input.itemId,
            input.reason
          );
        } catch (error) {
          translateLifecycleError(error, errors);
        }
      }),
    disable: ownerProcedure
      .input(
        z.object({
          itemId: z.string().min(1),
          reason: z.string().trim().min(3).max(500),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await changeProfileCatalogLifecycle(
            db,
            session.user.id,
            input.itemId,
            "disable",
            input.reason
          );
        } catch (error) {
          translateLifecycleError(error, errors);
        }
      }),
    restore: ownerProcedure
      .input(
        z.object({
          itemId: z.string().min(1),
          reason: z.string().trim().min(3).max(500),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await changeProfileCatalogLifecycle(
            db,
            session.user.id,
            input.itemId,
            "restore",
            input.reason
          );
        } catch (error) {
          translateLifecycleError(error, errors);
        }
      }),
    rollback: ownerProcedure
      .input(
        z.object({
          itemId: z.string().min(1),
          reason: z.string().trim().min(3).max(500),
          revisionId: z.string().min(1),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await rollbackProfileCatalogRevision(
            db,
            session.user.id,
            input.itemId,
            input.revisionId,
            input.reason
          );
        } catch (error) {
          translateLifecycleError(error, errors);
        }
      }),
  },
  entitlements: {
    publishLayoutRequirement: ownerProcedure
      .input(
        z.object({
          key: z.enum(PROFILE_LAYOUT_KEYS),
          requiredTier: z.enum(PATRON_TIER_KEYS),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await publishProfileLayoutRequirement(
            db,
            session.user.id,
            input.key,
            input.requiredTier
          );
        } catch (error) {
          if (error instanceof ProfileEntitlementAdminError) {
            throw errors.BAD_REQUEST({ message: error.message });
          }
          throw error;
        }
      }),
    publishShowcaseRequirement: ownerProcedure
      .input(
        z.object({
          key: z.enum(PROFILE_SHOWCASE_TYPE_KEYS),
          requiredTier: z.enum(PATRON_TIER_KEYS),
        })
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await publishProfileShowcaseRequirement(
            db,
            session.user.id,
            input.key,
            input.requiredTier
          );
        } catch (error) {
          if (error instanceof ProfileEntitlementAdminError) {
            throw errors.BAD_REQUEST({ message: error.message });
          }
          throw error;
        }
      }),
  },
  decorations: {
    list: ownerProcedure.handler(({ context: { db } }) =>
      listOwnerProfileDecorations(db)
    ),
    publish: ownerProcedure
      .input(z.object({ itemId: z.string().min(1) }))
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await publishProfileDecorationDraft(
            db,
            session.user.id,
            input.itemId
          );
        } catch (error) {
          translateDecorationError(error, errors);
        }
      }),
    saveDraft: ownerProcedure
      .input(z.object({ draft: z.unknown() }))
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await saveProfileDecorationDraft(
            db,
            session.user.id,
            input.draft
          );
        } catch (error) {
          translateDecorationError(error, errors);
        }
      }),
  },
  skins: {
    list: ownerProcedure.handler(({ context: { db } }) =>
      listOwnerProfileSkins(db)
    ),
    publish: ownerProcedure
      .input(z.object({ itemId: z.string().min(1) }))
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await publishProfileSkinDraft(
            db,
            session.user.id,
            input.itemId
          );
        } catch (error) {
          translateCatalogError(error, errors);
        }
      }),
    saveDraft: ownerProcedure
      .input(z.object({ draft: z.unknown() }))
      .handler(async ({ context: { db, session }, errors, input }) => {
        rejectImpersonation(session, errors);
        try {
          return await saveProfileSkinDraft(db, session.user.id, input.draft);
        } catch (error) {
          translateCatalogError(error, errors);
        }
      }),
  },
};
