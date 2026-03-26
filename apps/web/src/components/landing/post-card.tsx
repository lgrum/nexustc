import { FavouriteIcon, StarIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { cn, getBucketUrl, getTierColor } from "@/lib/utils";

import { Card, CardFooter, CardHeader, CardTitle } from "../ui/card";

export type PostProps = {
  id: string;
  title: string;
  version: string | null;
  type: "post" | "comic";
  imageObjectKeys: string[] | null;
  favorites: number;
  likes: number;
  views: number;
  averageRating?: number;
};

type PostCardProps = {
  post: PostProps;
};

export function PostCard({ post }: PostCardProps) {
  const images = (post.imageObjectKeys?.slice(0, 4) ?? []).map(getBucketUrl);
  const count = images.length;

  return (
    <Link
      className="group w-full transition-transform hover:scale-[1.02]"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      <Card
        className="relative rounded-t-xl h-full"
        style={{
          paddingBlock: "0px", // pt-0 gets overridden for some reason
        }}
      >
        {/* Image area */}
        <div
          className={cn(
            "min-h-0 pt-0.75",
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
            <div className="grid h-full w-full grid-cols-2">
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
            <div className="grid h-full w-full grid-cols-2">
              <div className="grid min-h-0 grid-rows-2">
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
            <div className="grid h-full w-full grid-cols-2 grid-rows-2">
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
          {/* Gradient overlay */}
          {/* <div className="absolute inset-0 bg-linear-to-t from-card via-transparent to-transparent" /> */}
          {/* Version badge */}
          {post.version && (
            <span className="absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 font-medium text-[10px] text-white backdrop-blur-sm">
              {post.version}
            </span>
          )}
        </div>

        {/* Tier bar */}
        <div
          className={`absolute inset-0 top-0 h-0.75 w-full ${getTierColor(post.favorites)}`}
        />

        <CardHeader className="grow">
          <CardTitle className="text-center">{post.title}</CardTitle>
        </CardHeader>

        {/* Body */}
        <CardFooter className="flex flex-col gap-1.5 p-3">
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
