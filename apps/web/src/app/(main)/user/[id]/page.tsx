import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";

import { orpcClient } from "@/lib/orpc";

import { PublicProfileHero } from "./public-profile-hero";
import { UserClient } from "./user-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function getProfile(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("profiles", `profile:${id}`);

  const profile = await orpcClient.profile.getPublic(
    { includeCurrentStreak: false, userId: id },
    { context: { cache: true } }
  );
  if (!profile) {
    notFound();
  }

  return profile;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getProfile(id);
  return {
    title: `NeXusTC - Usuario: ${profile.name}`,
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const [profile, currentStreak] = await Promise.all([
    getProfile(id),
    orpcClient.profile.getPublicCurrentStreak({ userId: id }),
  ]);
  const publicProfile =
    currentStreak === null ? profile : { ...profile, currentStreak };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-9 px-3 py-5 pb-12 sm:px-4 md:py-8">
      <PublicProfileHero profile={publicProfile} />
      <UserClient
        userId={profile.id}
        userName={profile.name}
        visibility={profile.visibility}
      />
    </main>
  );
}
