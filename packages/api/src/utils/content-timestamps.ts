type DocumentStatus = "draft" | "pending" | "publish" | "trash";

export function resolveReleasedAt(params: {
  documentStatus: DocumentStatus;
  existingReleasedAt: Date | null;
  now: Date;
  previousStatus: DocumentStatus;
  requestedReleasedAt?: Date | null;
}): Date | null {
  if (params.documentStatus !== "publish") {
    return params.existingReleasedAt;
  }

  if (params.previousStatus !== "publish") {
    return params.requestedReleasedAt && params.requestedReleasedAt > params.now
      ? params.requestedReleasedAt
      : params.now;
  }

  const isAwaitingRelease =
    params.existingReleasedAt === null ||
    params.existingReleasedAt > params.now;

  if (!isAwaitingRelease) {
    return params.existingReleasedAt;
  }

  return params.requestedReleasedAt && params.requestedReleasedAt > params.now
    ? params.requestedReleasedAt
    : params.now;
}

export function resolvePublishReleasedAt(input: {
  documentStatus: DocumentStatus;
  now: Date;
  requestedReleasedAt?: Date | null;
}): Date | null {
  if (input.documentStatus !== "publish") {
    return null;
  }

  return input.requestedReleasedAt && input.requestedReleasedAt > input.now
    ? input.requestedReleasedAt
    : input.now;
}

export function resolveVersionUpdatedAt(params: {
  documentStatus: DocumentStatus;
  existingReleasedAt: Date | null;
  nextReleasedAt: Date | null;
  now: Date;
  previousStatus: DocumentStatus;
  versionChanged: boolean;
}): Date | null | undefined {
  const wasPublished =
    params.previousStatus === "publish" &&
    params.existingReleasedAt !== null &&
    params.existingReleasedAt <= params.now;
  const isPublished =
    params.documentStatus === "publish" &&
    params.nextReleasedAt !== null &&
    params.nextReleasedAt <= params.now;

  if (!wasPublished && params.documentStatus === "publish") {
    return null;
  }

  return params.versionChanged && wasPublished && isPublished
    ? params.now
    : undefined;
}
