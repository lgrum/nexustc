import { cacheLife, cacheTag } from "next/cache";

import "@/lib/orpc.server";
import { renderContentOpenGraphImage } from "@/lib/content-og-image";
import { orpcClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

const NANOID_PATTERN = /^[0-9A-Za-z]{21}$/;
const MAX_IDENTIFIER_LENGTH = 255;

type ContentType = "comic" | "post";

type RouteProps = {
  params: Promise<{ identifier: string; type: string }>;
};

function getErrorCode(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

function isContentType(value: string): value is ContentType {
  return value === "comic" || value === "post";
}

async function getContent(type: ContentType, identifier: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("content", `content:${identifier}`);

  const input = NANOID_PATTERN.test(identifier)
    ? identifier
    : { slug: identifier, type };

  return await orpcClient.post.getPostById(input, {
    context: { cache: true },
  });
}

function notFoundResponse() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: Request, { params }: RouteProps) {
  const { identifier, type } = await params;

  if (
    !isContentType(type) ||
    !identifier ||
    identifier.length > MAX_IDENTIFIER_LENGTH
  ) {
    return notFoundResponse();
  }

  try {
    const content = await getContent(type, identifier);
    if (content.type !== type) {
      return notFoundResponse();
    }

    const coverObjectKey = getCoverImageObjectKey(
      content.imageObjectKeys,
      content.coverImageObjectKey
    );

    return await renderContentOpenGraphImage({
      coverImageUrl: coverObjectKey ? getBucketUrl(coverObjectKey) : undefined,
      type,
    });
  } catch (error) {
    if (getErrorCode(error) === "NOT_FOUND") {
      return notFoundResponse();
    }

    return Response.redirect(new URL("/og-image.png", request.url), 307);
  }
}
