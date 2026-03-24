import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { RatingButton } from "@/components/ratings/rating-button";
import { RatingDisplay } from "@/components/ratings/rating-display";
import { RatingList } from "@/components/ratings/rating-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/post/reviews/$id")({
  component: ReviewsPage,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Valoraciones",
      },
    ],
  }),
});

function ReviewsPage() {
  const { id: postId } = Route.useParams();

  const { data: post } = useQuery({
    queryFn: () => orpcClient.post.getPostById(postId),
    queryKey: ["post", postId],
  });

  const { data: stats } = useQuery({
    queryFn: () => orpcClient.rating.getStats({ postId }),
    queryKey: ["rating", "stats", postId],
  });

  return (
    <main className="grid w-full grid-cols-1 lg:grid-cols-5">
      <div className="space-y-8 lg:col-span-3 lg:col-start-2">
        <div className="flex items-center gap-4">
          <Link params={{ id: postId }} to="/post/$id">
            <Button size="icon" variant="ghost">
              <HugeiconsIcon icon={ArrowLeft02Icon} />
            </Button>
          </Link>
          <div className="flex flex-col">
            <h1 className="font-bold text-2xl">Valoraciones</h1>
            {post && <p className="text-muted-foreground">{post.title}</p>}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="font-bold text-3xl">
                Todas las Valoraciones
              </CardTitle>
              <RatingButton postId={postId} />
            </div>
            {stats && stats.ratingCount > 0 && (
              <RatingDisplay
                averageRating={stats.averageRating}
                ratingCount={stats.ratingCount}
                variant="full"
              />
            )}
          </CardHeader>

          <CardContent>
            <RatingList postId={postId} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
