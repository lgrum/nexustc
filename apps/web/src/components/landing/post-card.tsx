import { FavouriteIcon, StarIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PREMIUM_STATUS_CATEGORIES } from "@repo/shared/constants";
import { Link } from "@tanstack/react-router";

import { getDisplayImageObjectKeys } from "@/lib/post-images";
import { cn, getBucketUrl, getTierColor } from "@/lib/utils";

import { Badge } from "../ui/badge";
import { Card, CardFooter, CardHeader, CardTitle } from "../ui/card";

export type PostProps = {
  comicProgressStatus?: "read" | "reading" | "unread" | "updated" | null;
  id: string;
  title: string;
  version: string | null;
  type: "post" | "comic";
  coverImageObjectKey?: string | null;
  imageObjectKeys: string[] | null;
  favorites: number;
  likes: number;
  views: number;
  averageRating?: number;
  terms?: {
    name: string;
    taxonomy: string;
  }[];
};

type PostCardProps = {
  post: PostProps;
};

const ABANDONED_STATUS_NAME = "Abandonado";

function statusMatches(
  statusName: string | undefined,
  names: readonly string[]
) {
  return statusName !== undefined && names.includes(statusName);
}

function getVersionBadgeClassName(statusName: string | undefined) {
  if (statusName === ABANDONED_STATUS_NAME) {
    return "bg-red-500/90 text-white";
  }

  if (statusMatches(statusName, PREMIUM_STATUS_CATEGORIES.ongoing)) {
    return "bg-yellow-400 text-yellow-950";
  }

  if (statusMatches(statusName, PREMIUM_STATUS_CATEGORIES.completed)) {
    return "bg-green-500/90 text-white";
  }

  return "bg-black/50 text-white";
}

function getComicProgressBadge(
  status: PostProps["comicProgressStatus"]
): { className: string; label: string } | null {
  switch (status) {
    case "read": {
      return {
        className:
          "border-emerald-500/30 bg-emerald-500/90 text-white shadow-sm",
        label: "Leido",
      };
    }
    case "updated": {
      return {
        className: "border-amber-400/40 bg-amber-400 text-amber-950 shadow-sm",
        label: "Nuevo",
      };
    }
    default: {
      return null;
    }
  }
}

export function PostCard({ post }: PostCardProps) {
  const imageLimit = post.type === "comic" ? 1 : 4;
  const images = getDisplayImageObjectKeys(
    post.imageObjectKeys,
    post.coverImageObjectKey
  )
    .slice(0, imageLimit)
    .map(getBucketUrl);
  const count = images.length;
  const comicProgressBadge = getComicProgressBadge(post.comicProgressStatus);
  const statusName = post.terms?.find(
    (term) => term.taxonomy === "status"
  )?.name;
  const versionBadgeClassName = getVersionBadgeClassName(statusName);

  return (
    <Link
      className="group w-full transition-transform hover:scale-[1.02]"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      <Card
        className="relative rounded-t-xl h-full pb-0.75"
        style={{
          paddingBlock: "0px", // pt-0 gets overridden for some reason
        }}
      >
        {/* Image area */}
        <div
          className={cn(
            "min-h-0",
            post.type === "comic"
              ? "relative aspect-3/4"
              : "relative aspect-video"
          )}
        >
          {count === 0 && (
            <div className="h-full w-full bg-linear-to-br from-muted to-card" />
          )}
          {post.type === "comic" && count > 0 && (
            <img
              alt={post.title}
              className="h-full w-full object-cover transition-transform duration-300"
              src={images[0]}
            />
          )}
          {post.type === "post" && count === 1 && (
            <img
              alt={post.title}
              className="h-full w-full object-cover transition-transform duration-300"
              src={images[0]}
            />
          )}
          {post.type === "post" && count === 2 && (
            <div className="grid h-full w-full grid-cols-2 gap-px bg-border">
              {images.map((img) => (
                <img
                  alt={post.title}
                  className="h-full w-full object-cover"
                  key={img}
                  src={img}
                />
              ))}
            </div>
          )}
          {post.type === "post" && count === 3 && (
            <div className="grid h-full w-full grid-cols-2 gap-px bg-border">
              <div className="grid min-h-0 grid-rows-2 gap-px bg-border">
                <img
                  alt={post.title}
                  className="h-full w-full object-cover"
                  src={images[0]}
                />
                <img
                  alt={post.title}
                  className="h-full w-full object-cover"
                  src={images[1]}
                />
              </div>
              <img
                alt={post.title}
                className="h-full w-full object-cover"
                src={images[2]}
              />
            </div>
          )}
          {post.type === "post" && count >= 4 && (
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-border">
              {images.map((img) => (
                <img
                  alt={post.title}
                  className="h-full w-full object-cover"
                  key={img}
                  src={img}
                />
              ))}
            </div>
          )}
          {post.type === "comic" && comicProgressBadge && (
            <Badge
              className={cn(
                "pointer-events-none absolute top-2 left-2 z-10",
                comicProgressBadge.className
              )}
            >
              {comicProgressBadge.label}
            </Badge>
          )}
        </div>

        <CardHeader>
          <CardTitle className="text-center text-pretty">
            {post.title}
            {post.version && (
              <span
                className={cn(
                  "ml-2 inline-flex items-center rounded px-1.5 py-1 text-[12px] leading-none font-medium backdrop-blur-sm",
                  versionBadgeClassName
                )}
              >
                {post.version}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        {/* Body */}
        <CardFooter className="relative flex flex-col border-t-0 gap-1.5 p-3">
          {/* Tier bar */}
          <div
            className={`absolute -top-1 h-0.75 w-full z-50 ${getTierColor(post.likes)}`}
          />
          {/* Stats row */}
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm">
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon
                className="size-4 fill-red-500 text-red-500"
                icon={FavouriteIcon}
              />
              {post.likes}
            </span>
            {post.averageRating !== 0 && post.averageRating !== undefined && (
              <span className="inline-flex items-center gap-1 text-primary">
                <HugeiconsIcon
                  className="size-4 fill-amber-400 text-amber-400"
                  icon={StarIcon}
                />
                {post.averageRating.toFixed(1)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon className="size-4" icon={ViewIcon} />
              {post.views}
            </span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
