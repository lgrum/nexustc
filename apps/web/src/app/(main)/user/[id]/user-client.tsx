"use client";

import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PublicProfile } from "@repo/api/services/profile";
import { useQuery } from "@tanstack/react-query";
import { formatDistance } from "date-fns";
import { es } from "date-fns/locale";

import { PostCard } from "@/components/landing/post-card";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ProfileBanner } from "@/components/profile/profile-banner";
import { ProfileNameplate } from "@/components/profile/profile-nameplate";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orpc } from "@/lib/orpc";

export function UserClient({ profile }: { profile: PublicProfile }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-3 py-4 pb-10 sm:px-4 md:py-8">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-card">
        <ProfileBanner
          banner={profile.banner}
          className="rounded-none border-0"
        />
        <div className="-mt-16 flex flex-col gap-4 px-4 pb-5 sm:px-6">
          <ProfileAvatar
            className="size-28 border-4 border-card shadow-xl sm:size-32"
            user={profile}
          />
          <div className="flex flex-col gap-3">
            <ProfileNameplate
              nameClassName="text-3xl font-black tracking-tight"
              showEmblems
              showProfileRoles
              user={profile}
            />
            <p className="text-muted-foreground text-sm">
              Registrado{" "}
              {formatDistance(profile.createdAt, new Date(), {
                addSuffix: true,
                locale: es,
              })}
            </p>
          </div>
        </div>
      </section>

      <Tabs defaultValue="bookmarks">
        <TabsList className="w-full">
          <TabsTrigger value="bookmarks">Favoritos</TabsTrigger>
          <TabsTrigger value="reviews">Reseñas</TabsTrigger>
        </TabsList>
        <TabsContent value="bookmarks">
          <UserBookmarksSection userId={profile.id} />
        </TabsContent>
        <TabsContent value="reviews">
          <UserReviewsSection userId={profile.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserBookmarksSection({ userId }: { userId: string }) {
  const { data: bookmarks, isPending } = useQuery(
    orpc.user.getUserBookmarks.queryOptions({ input: { userId } })
  );

  if (isPending) {
    return <Spinner />;
  }

  const safeBookmarks = bookmarks ?? [];

  if (safeBookmarks.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No tiene favoritos aún.
      </p>
    );
  }

  const posts = safeBookmarks.filter((bookmark) => bookmark.type === "post");
  const comics = safeBookmarks.filter((bookmark) => bookmark.type === "comic");

  return (
    <Tabs
      className="rounded-[2rem] border border-border bg-card p-4"
      defaultValue="posts"
    >
      <TabsList className="w-full">
        <TabsTrigger value="posts">Juegos</TabsTrigger>
        <TabsTrigger value="comics">Comics</TabsTrigger>
      </TabsList>
      <TabsContent value="posts">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </TabsContent>
      <TabsContent value="comics">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {comics.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function UserReviewsSection({ userId }: { userId: string }) {
  const { data, isPending } = useQuery(
    orpc.rating.getByUserId.queryOptions({ input: { userId } })
  );

  if (isPending) {
    return <Spinner />;
  }

  if (!data) {
    return null;
  }

  const postMap = new Map(data.posts.map((post) => [post.id, post]));

  if (data.ratings.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No tiene reseñas aún.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.ratings.map((rating) => {
        const ratingPost = postMap.get(rating.postId);
        if (!ratingPost) {
          return null;
        }

        return (
          <Card className="rounded-[2rem]" key={rating.postId}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex flex-row items-center justify-between gap-2">
                <span className="font-semibold">{ratingPost.title}</span>
                <div className="inline-flex items-center gap-1 text-sm">
                  <HugeiconsIcon
                    className="size-4 fill-amber-400 text-amber-400"
                    icon={StarIcon}
                  />
                  <span>{rating.rating}/10</span>
                </div>
              </div>
              {rating.review ? (
                <p className="text-muted-foreground text-sm">{rating.review}</p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                {formatDistance(rating.createdAt, new Date(), {
                  addSuffix: true,
                  locale: es,
                })}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
