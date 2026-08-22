import type { db as database } from "@repo/db";

import type { DeferredMediaSelectionInput } from "../utils/deferred-media";
import { withDeferredMediaSelection } from "../utils/deferred-media";
import {
  profileDecorationDeferredDraftSchema,
  ProfileDecorationCatalogError,
  saveProfileDecorationDraft,
} from "./profile-decoration-catalog";
import {
  assertStaticProfileSkinUpload,
  profileSkinDeferredDraftSchema,
  ProfileSkinCatalogError,
  saveProfileSkinDraft,
} from "./profile-skin-catalog";

type Database = typeof database;

function fieldErrors(issues: { message: string; path: PropertyKey[] }[]) {
  return Object.fromEntries(
    issues.map((issue) => [issue.path.join(".") || "form", issue.message])
  );
}

export async function saveProfileSkinDraftWithBackground(
  db: Database,
  actorUserId: string,
  input: unknown,
  backgroundSelection: DeferredMediaSelectionInput,
  expectedUpdatedAt?: Date
) {
  const parsed = profileSkinDeferredDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProfileSkinCatalogError(
      "INVALID_DRAFT",
      "El borrador del Skin no es válido.",
      fieldErrors(parsed.error.issues)
    );
  }

  return await withDeferredMediaSelection({
    db,
    onComplete: async ({ orderedMedia, tx }) =>
      await saveProfileSkinDraft(
        tx,
        actorUserId,
        {
          ...parsed.data,
          backgroundAssetId: orderedMedia[0]?.id ?? null,
        },
        expectedUpdatedAt
      ),
    ownerKind: "Perfil",
    resourceName:
      parsed.data.itemId ?? parsed.data.stableKey ?? parsed.data.name,
    selection: backgroundSelection,
    validatePendingFile: assertStaticProfileSkinUpload,
  });
}

export async function saveProfileDecorationDraftWithMedia(
  db: Database,
  actorUserId: string,
  input: unknown,
  mediaSelection: DeferredMediaSelectionInput,
  expectedUpdatedAt?: Date
) {
  const parsed = profileDecorationDeferredDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProfileDecorationCatalogError(
      "INVALID_DRAFT",
      "El borrador de la Decoration no es válido.",
      fieldErrors(parsed.error.issues)
    );
  }

  return await withDeferredMediaSelection({
    db,
    onComplete: async ({ orderedMedia, tx }) =>
      await saveProfileDecorationDraft(
        tx,
        actorUserId,
        { ...parsed.data, mediaAssetId: orderedMedia[0]?.id ?? null },
        expectedUpdatedAt
      ),
    ownerKind: "Perfil",
    resourceName:
      parsed.data.itemId ?? parsed.data.stableKey ?? parsed.data.name,
    selection: mediaSelection,
  });
}
