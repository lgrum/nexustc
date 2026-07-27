import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NotificationSettingsSection } from "./notification-settings-section";

const mocks = vi.hoisted(() => ({
  updateNotificationPreferences: vi.fn(),
}));

vi.mock("@/lib/orpc", () => ({
  orpc: {
    profile: {
      getMySettings: {
        queryOptions: () => ({ queryKey: ["profile", "settings"] }),
      },
    },
  },
  orpcClient: {
    profile: {
      updateNotificationPreferences: mocks.updateNotificationPreferences,
    },
  },
}));

describe(NotificationSettingsSection, () => {
  it("saves the in-app comment reply preference immediately", async () => {
    mocks.updateNotificationPreferences.mockResolvedValue({
      commentReplies: false,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationSettingsSection commentReplies={true} />
      </QueryClientProvider>
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Respuestas a mis comentarios",
      })
    );

    await waitFor(() => {
      expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith({
        commentReplies: false,
      });
    });
  });
});
