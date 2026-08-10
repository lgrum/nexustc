import type { PublicProfile } from "@repo/api/services/profile";
import { render, screen } from "@testing-library/react";

import { PublicProfileHero } from "./public-profile-hero";

it("always renders public Account Level without private XP totals", () => {
  const profile = {
    accountLevel: 42,
    activityCounts: { favorites: 0, reviews: 0 },
    avatar: null,
    avatarFallbackColor: "#111827",
    banner: { asset: null, color: "#111827", mode: "color" },
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    eterisBalance: null,
    href: "/user/user-1",
    id: "user-1",
    image: null,
    maxVisibleEmblems: 3,
    name: "Nexus",
    patronBadge: null,
    patronTier: "none",
    profileEmblems: [],
    profileRoles: [],
    role: "user",
    roleBadge: null,
    roleGradient: null,
    visibility: { favorites: true, reviews: true },
  } satisfies PublicProfile;

  render(<PublicProfileHero profile={profile} />);

  expect(screen.getByText("Account Level")).toBeTruthy();
  expect(screen.getByText("42")).toBeTruthy();
  expect(screen.queryByText(/XP/)).toBeNull();
});

it("omits Account Level when the economy is unavailable", () => {
  const profile = {
    accountLevel: null,
    activityCounts: { favorites: 0, reviews: 0 },
    avatar: null,
    avatarFallbackColor: "#111827",
    banner: { asset: null, color: "#111827", mode: "color" },
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    eterisBalance: null,
    href: "/user/user-1",
    id: "user-1",
    image: null,
    maxVisibleEmblems: 3,
    name: "Nexus",
    patronBadge: null,
    patronTier: "none",
    profileEmblems: [],
    profileRoles: [],
    role: "user",
    roleBadge: null,
    roleGradient: null,
    visibility: { favorites: true, reviews: true },
  } satisfies PublicProfile;

  render(<PublicProfileHero profile={profile} />);

  expect(screen.queryByText("Account Level")).toBeNull();
});

it("renders only an opted-in public Eteris balance", () => {
  const profile = {
    accountLevel: 1,
    activityCounts: { favorites: null, reviews: null },
    avatar: null,
    avatarFallbackColor: "#111827",
    banner: { asset: null, color: "#111827", mode: "color" },
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    eterisBalance: "9223372036854775807",
    href: "/user/user-1",
    id: "user-1",
    image: null,
    maxVisibleEmblems: 3,
    name: "Nexus",
    patronBadge: null,
    patronTier: "none",
    profileEmblems: [],
    profileRoles: [],
    role: "user",
    roleBadge: null,
    roleGradient: null,
    visibility: { favorites: false, reviews: false },
  } satisfies PublicProfile;

  render(<PublicProfileHero profile={profile} />);

  expect(screen.getByText("Eteris")).toBeTruthy();
  expect(screen.getByText("9223372036854775807")).toBeTruthy();
  expect(screen.queryByText(/deuda|congelada|historial/i)).toBeNull();
});
