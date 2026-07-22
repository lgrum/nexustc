import { auth } from "@repo/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileClient } from "./profile-client";

export const metadata: Metadata = {
  title: "NeXusTC - Perfil",
};

export const PROFILE_SECTIONS = [
  "overview",
  "appearance",
  "library",
  "following",
  "account",
  "security",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

type PageProps = {
  searchParams: Promise<{ section?: string | string[] }>;
};

export function parseProfileSection(value?: string | string[]): ProfileSection {
  const candidate = Array.isArray(value) ? value[0] : value;

  return PROFILE_SECTIONS.includes(candidate as ProfileSection)
    ? (candidate as ProfileSection)
    : "overview";
}

export default async function Page({ searchParams }: PageProps) {
  const requestHeaders = await headers();
  const [params, session] = await Promise.all([
    searchParams,
    auth.api.getSession({ headers: requestHeaders }),
  ]);

  if (!session) {
    redirect("/auth");
  }

  return (
    <ProfileClient
      activeSection={parseProfileSection(params.section)}
      user={session.user}
    />
  );
}
