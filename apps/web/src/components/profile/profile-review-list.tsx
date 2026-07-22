import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

import { ReviewMarkdown } from "@/components/ratings/review-markdown";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ProfileReviewItem = {
  createdAt: Date | string;
  postId: string;
  postSlug: string;
  postTitle: string;
  postType: "comic" | "post";
  rating: number;
  review: string;
  updatedAt: Date | string;
};

function getContentHref(item: ProfileReviewItem) {
  return item.postType === "comic"
    ? `/comic/${item.postSlug}`
    : `/post/${item.postSlug}`;
}

export function ProfileReviewList({
  className,
  items,
  renderOwnerActions,
}: {
  className?: string;
  items: ProfileReviewItem[];
  renderOwnerActions?: (item: ProfileReviewItem) => React.ReactNode;
}) {
  return (
    <ul className={cn("grid gap-4 xl:grid-cols-2", className)}>
      {items.map((item) => {
        const createdAt = new Date(item.createdAt);
        const updatedAt = new Date(item.updatedAt);
        const wasEdited = updatedAt.getTime() > createdAt.getTime();

        return (
          <li key={item.postId}>
            <article className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-border/80 bg-card/75 shadow-sm transition-colors hover:border-primary/25">
              <header className="flex flex-wrap items-start justify-between gap-3 border-border/60 border-b px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full" variant="outline">
                      {item.postType === "comic" ? "Comic" : "Juego"}
                    </Badge>
                    <div className="inline-flex items-center gap-1 rounded-full bg-amber-400/12 px-2.5 py-1 font-semibold text-amber-200 text-xs tabular-nums">
                      <HugeiconsIcon
                        aria-hidden
                        className="size-3.5 fill-amber-300 text-amber-300"
                        icon={StarIcon}
                      />
                      <span>{item.rating}/10</span>
                    </div>
                  </div>
                  <h3 className="mt-3 text-balance font-lexend font-semibold text-lg leading-tight">
                    <Link
                      className="rounded-sm underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      href={getContentHref(item)}
                    >
                      {item.postTitle}
                    </Link>
                  </h3>
                </div>
                {renderOwnerActions ? (
                  <div className="shrink-0">{renderOwnerActions(item)}</div>
                ) : null}
              </header>

              <ReviewMarkdown className="flex-1 px-5 py-4" patronTier="none">
                {item.review}
              </ReviewMarkdown>

              <footer className="border-border/50 border-t px-5 py-3 text-muted-foreground text-xs">
                <time dateTime={createdAt.toISOString()}>
                  {format(createdAt, "PPP", { locale: es })}
                </time>
                {wasEdited ? <span> · Editada</span> : null}
              </footer>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
