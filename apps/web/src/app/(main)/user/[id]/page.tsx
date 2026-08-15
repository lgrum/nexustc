import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ProfileDecorationSurface } from "@/components/profile/profile-decoration-surface";
import { ProfileSkinSurface } from "@/components/profile/profile-skin-surface";
import { orpcClient } from "@/lib/orpc";

import { ProfileShowcaseLayout } from "./profile-showcase-layout";
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
  const sessionPromise = (async () =>
    auth.api.getSession({ headers: await headers() }))();
  const [profile, scalarShowcases, currentStreak, session] = await Promise.all([
    getProfile(id),
    orpcClient.profile.getPublicScalarShowcases({ userId: id }).catch(() => []),
    orpcClient.profile.getPublicCurrentStreak({ userId: id }).catch(() => null),
    sessionPromise,
  ]);
  const publicProfile =
    currentStreak === null ? profile : { ...profile, currentStreak };
  const { manifest } = profile;
  const showcases = manifest
    ? [...manifest.showcases, ...scalarShowcases].toSorted(
        (left, right) => left.order - right.order
      )
    : undefined;

  const contents = (
    <>
      <PublicProfileHero
        customizationHref={
          session?.user.id === id && manifest ? "/profile/customize" : undefined
        }
        profile={publicProfile}
        showLegacyStats={!manifest}
      />
      {manifest ? (
        <ProfileShowcaseLayout rendererKey={manifest.layout.rendererKey}>
          <UserClient
            showcases={showcases}
            userId={profile.id}
            userName={profile.name}
            visibility={profile.visibility}
          />
        </ProfileShowcaseLayout>
      ) : (
        <UserClient
          userId={profile.id}
          userName={profile.name}
          visibility={profile.visibility}
        />
      )}
    </>
  );
  return manifest ? (
    <ProfileSkinSurface
      as="main"
      className="mx-auto flex w-full max-w-6xl flex-col gap-9 px-3 py-5 pb-12 sm:px-4 md:py-8"
      skin={manifest.skin}
    >
      <ProfileDecorationSurface
        className="flex flex-col gap-9"
        decorations={manifest.decorations}
      >
        {contents}
      </ProfileDecorationSurface>
    </ProfileSkinSurface>
  ) : (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-9 px-3 py-5 pb-12 sm:px-4 md:py-8">
      {contents}
    </main>
  );
}
