import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AccountSection } from "./account-section";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn().mockResolvedValue(true),
  invalidateQueries: vi.fn().mockResolvedValue(),
  syncMembership: vi.fn().mockResolvedValue(),
  unlinkAccount: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: {
    mutationFn: () => Promise<unknown>;
    onSuccess: () => Promise<void>;
  }) => ({
    isPending: false,
    mutate: async () => {
      await options.mutationFn();
      await options.onSuccess();
    },
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useSuspenseQuery: (options: { queryKey: string[] }) => ({
    data:
      options.queryKey[0] === "profile"
        ? [{ accountId: "patreon-1", providerId: "patreon" }]
        : {
            benefits: {
              adFree: false,
              badge: null,
              premiumLinks: { type: "none" },
            },
            isPatron: false,
            lastSyncAt: null,
            patronSince: null,
            tier: "none",
          },
  }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => mocks.confirm,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    unlinkAccount: mocks.unlinkAccount,
  },
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    appTheme: {
      getMine: { queryOptions: () => ({ queryKey: ["app-theme", "mine"] }) },
    },
    patreon: {
      getStatus: { queryOptions: () => ({ queryKey: ["patreon-status"] }) },
    },
    profile: {
      getMySettings: {
        queryOptions: () => ({ queryKey: ["profile-settings"] }),
      },
    },
  },
  orpcClient: {
    patreon: { syncMembership: mocks.syncMembership },
  },
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

it.each(["Desvincular", "Sincronizar"])(
  "%s Patreon reconciles the private App Theme query",
  async (action) => {
    render(<AccountSection userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: action }));

    await waitFor(() =>
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["app-theme", "mine", { userId: "user-1" }],
      })
    );
  }
);
