import { render, screen } from "@testing-library/react";

import { ProfileClient } from "./profile-client";

const mocks = vi.hoisted(() => ({
  catalogVisible: false,
  setTheme: vi.fn(),
  streakAvailable: false,
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: (options: { queryKey: string[] }) => ({
    data:
      options.queryKey[0] === "app-theme"
        ? {
            catalogVisible: mocks.catalogVisible,
            effectiveTheme: "predeterminado",
            premiumEligible: mocks.catalogVisible,
            requiredTier: null,
            selectedTheme: "predeterminado",
          }
        : options.queryKey[0] === "streak"
          ? { available: mocks.streakAvailable }
          : {
              settings: {
                notifications: { commentReplies: true },
                visibility: { favorites: true, reviews: true, streak: false },
              },
              summary: null,
            },
  }),
}));
vi.mock("@/components/profile/account-section", () => ({
  AccountSection: () => null,
}));
vi.mock("@/components/profile/appearance-section", () => ({
  AppearanceSection: () => null,
}));
vi.mock("@/components/profile/following-section", () => ({
  FollowingSection: () => null,
}));
vi.mock("@/components/profile/notification-settings-section", () => ({
  NotificationSettingsSection: () => null,
}));
vi.mock("@/components/profile/profile-library-section", () => ({
  ProfileLibrarySection: () => null,
}));
vi.mock("@/components/profile/security-section", () => ({
  SecuritySection: () => null,
}));
vi.mock("@/components/profile/streak-section", () => ({
  StreakSection: () => <div>Racha privada</div>,
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    appTheme: {
      getMine: { queryOptions: () => ({ queryKey: ["app-theme"] }) },
    },
    profile: {
      getMySettings: { queryOptions: () => ({ queryKey: ["profile"] }) },
    },
    streak: {
      getMine: { queryOptions: () => ({ queryKey: ["streak"] }) },
    },
  },
  queryClient: { clear: vi.fn() },
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock("@/components/profile/profile-identity", () => ({
  ProfileIdentity: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/profile/profile-overview-section", () => ({
  ProfileOverviewSection: () => <div>Resumen visible</div>,
}));
vi.mock("@/components/profile/theme-section", () => ({
  ThemeSection: () => <div>Ajustes de tema</div>,
}));

const user = {
  avatarFallbackColor: "#000000",
  email: "test@example.com",
  id: "user-1",
  image: null,
  name: "Test",
  twoFactorEnabled: false,
} as never;

it("hides Tema and falls back to overview when the catalog is staff-only", () => {
  mocks.catalogVisible = false;
  render(<ProfileClient activeSection="theme" user={user} />);
  expect(screen.queryByRole("link", { name: "Tema" })).toBeNull();
  expect(screen.getByText("Resumen visible")).toBeTruthy();
  expect(screen.queryByText("Ajustes de tema")).toBeNull();
});

it("shows the Tema section to an authorized account", () => {
  mocks.catalogVisible = true;
  render(<ProfileClient activeSection="theme" user={user} />);
  expect(screen.getAllByRole("link", { name: "Tema" })).toHaveLength(2);
  expect(screen.getByText("Ajustes de tema")).toBeTruthy();
});

it("shows Racha only while every rollout gate is effective", () => {
  mocks.streakAvailable = false;
  const hidden = render(<ProfileClient activeSection="streak" user={user} />);
  expect(screen.queryByRole("link", { name: "Racha" })).toBeNull();
  hidden.unmount();

  mocks.streakAvailable = true;
  render(<ProfileClient activeSection="streak" user={user} />);
  expect(screen.getAllByRole("link", { name: "Racha" })).toHaveLength(2);
  expect(screen.getByText("Racha privada")).toBeTruthy();
});
