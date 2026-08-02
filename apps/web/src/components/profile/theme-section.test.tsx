import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

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

function renderSection(themeState = state) {
  const client = new QueryClient();
  client.setQueryData(queryOptions.queryKey, themeState);
  render(
    <QueryClientProvider client={client}>
      <ThemeSection state={themeState} userId="user-1" />
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

it("renders premium choices as locked membership previews", () => {
  renderSection({
    ...state,
    premiumEligible: false,
    requiredTier: "level5",
  });

  expect(screen.getByRole("button", { name: /Predeterminado/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Ceniza Solar/ })).toBeNull();
  const preview = screen.getByRole("group", {
    name: "Ceniza Solar, tema bloqueado",
  });
  expect(within(preview).getByText("Bloqueado")).toBeTruthy();
  const upgrade = within(preview).getByRole("link", {
    name: "Ver membresías para desbloquear Ceniza Solar",
  });
  expect(upgrade.getAttribute("href")).toBe("/memberships");

  fireEvent.click(upgrade);
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.trackEvent).toHaveBeenCalledWith("app_theme_upgrade_clicked", {
    source: "theme_settings",
    themeId: "ceniza-solar",
  });
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

it("distinguishes a retained Selected Theme from the Effective Theme", () => {
  renderSection({
    ...state,
    effectiveTheme: "predeterminado",
    premiumEligible: false,
    requiredTier: "level5",
    selectedTheme: "ceniza-solar",
  });

  expect(
    screen
      .getByRole("button", { name: /Predeterminado/ })
      .getAttribute("aria-pressed")
  ).toBe("false");
  const retained = screen.getByRole("group", {
    name: "Ceniza Solar, tema seleccionado y bloqueado",
  });
  expect(within(retained).getByText("Seleccionado · Bloqueado")).toBeTruthy();
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
