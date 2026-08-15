import { auth } from "@repo/auth";
import { env } from "@repo/env";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { orpcClient } from "@/lib/orpc";

import { ProfileCustomizer } from "./profile-customizer";

export const metadata: Metadata = { title: "NeXusTC - Personalizar perfil" };

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth");
  }
  if (!env.PROFILE_CUSTOMIZATION_ENABLED) {
    notFound();
  }
  const [state, favoriteGames, profile, scalarShowcases] = await Promise.all([
    orpcClient.profile.getCustomizationEditorState(),
    orpcClient.profile.getFavoriteGamesEditorState(),
    orpcClient.profile.getPublic({
      includeCurrentStreak: false,
      userId: session.user.id,
    }),
    orpcClient.profile.getCustomizationScalarPreview(),
  ]);

  if (!profile) {
    redirect("/profile");
  }

  return (
    <ProfileCustomizer
      favoriteGames={favoriteGames}
      initialState={state}
      profile={profile}
      scalarShowcases={scalarShowcases}
    />
  );
}
