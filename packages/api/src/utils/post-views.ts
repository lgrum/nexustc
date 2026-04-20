import { createHash } from "node:crypto";

import type { Context } from "../context";

type PostViewViewerKeyParams = {
  anonymousViewerId?: string;
  headers: Headers;
  session: Context["session"];
};

export const POST_VIEW_DEDUPE_TTL_SECONDS = 60;

function hashViewerFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function getForwardedIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return (
    headers.get("cf-connecting-ip")?.trim() ||
    forwardedFor ||
    headers.get("x-real-ip")?.trim() ||
    null
  );
}

export function getPostViewViewerKey({
  anonymousViewerId,
  headers,
  session,
}: PostViewViewerKeyParams) {
  if (session?.user.id) {
    return `user:${session.user.id}`;
  }

  if (anonymousViewerId) {
    return `anon:${anonymousViewerId}`;
  }

  const ip = getForwardedIp(headers);
  const userAgent = headers.get("user-agent")?.trim() ?? null;

  if (!(ip || userAgent)) {
    return null;
  }

  return `fingerprint:${hashViewerFingerprint(`${ip ?? "unknown"}:${userAgent ?? "unknown"}`)}`;
}

export function getPostViewDedupeKey(postId: string, viewerKey: string) {
  return `post:view:${postId}:${viewerKey}`;
}
