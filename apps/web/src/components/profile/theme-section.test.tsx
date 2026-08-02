import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ThemeSection } from "./theme-section";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  setTheme: vi.fn(),
  toastError: vi.fn(),
  trackEvent: vi.fn(),
}));

const queryOptions = {
  queryKey: ["app-theme", "mine", { userId: "user-1" }],
};

vi.mock("@/lib/orpc", () => ({
  orpc: {
    appTheme: {
      getMine: { queryOptions: () => ({ queryKey: ["app-theme", "mine"] }) },
    },
  },
  orpcClient: { appTheme: { select: mocks.select } },
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: mocks.setTheme, theme: "predeterminado" }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: mocks.trackEvent }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

const state = {
  catalogVisible: true,
  effectiveTheme: "predeterminado" as const,
  premiumEligible: true,
  requiredTier: null,
  selectedTheme: "predeterminado" as const,
};

function renderSection() {
  const client = new QueryClient();
  client.setQueryData(queryOptions.queryKey, state);
  render(
    <QueryClientProvider client={client}>
      <ThemeSection state={state} userId="user-1" />
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => vi.clearAllMocks());

it("renders every catalog choice as an accessible button", () => {
  renderSection();
  expect(screen.getAllByRole("button")).toHaveLength(11);
  expect(
    screen
      .getByRole("button", { name: /Predeterminado/ })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /Vacío Coral/ })
      .getAttribute("aria-pressed")
  ).toBe("false");
});

it("applies immediately and records a successful save", async () => {
  const nextState = {
    ...state,
    effectiveTheme: "vacio-coral" as const,
    selectedTheme: "vacio-coral" as const,
  };
  let finishSave!: (value: typeof nextState) => void;
  mocks.select.mockImplementation(
    () => new Promise((resolve) => (finishSave = resolve))
  );
  renderSection();

  fireEvent.click(screen.getByRole("button", { name: /Vacío Coral/ }));
  await waitFor(() =>
    expect(mocks.setTheme).toHaveBeenCalledWith("vacio-coral")
  );
  finishSave(nextState);

  await waitFor(() =>
    expect(mocks.trackEvent).toHaveBeenCalledWith("app_theme_selected", {
      source: "theme_settings",
      themeId: "vacio-coral",
    })
  );
});

it("restores the visible and cached theme when saving fails", async () => {
  mocks.select.mockRejectedValue(new Error("Sin permiso"));
  const client = renderSection();

  fireEvent.click(screen.getByRole("button", { name: /Ceniza Solar/ }));

  await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  expect(mocks.setTheme).toHaveBeenLastCalledWith("predeterminado");
  expect(client.getQueryData(queryOptions.queryKey)).toEqual(state);
  expect(mocks.trackEvent).not.toHaveBeenCalled();
});
