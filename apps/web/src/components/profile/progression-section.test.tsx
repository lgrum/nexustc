import { render, screen } from "@testing-library/react";

import { ProgressionSection } from "./progression-section";

const state = vi.hoisted(() => ({
  history: {
    data: { pages: [{ items: [], nextCursor: null }] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: vi.fn(),
  },
  mine: {
    accrualEnabled: false,
    automaticRewards: [
      { amount: 10, level: 2 },
      { amount: 10, level: 3 },
    ],
    enabled: false,
    level: 1,
    nextLevelTotalXp: 67,
    pendingXp: 0,
    progress: 0,
    totalXp: 0,
    xpForNextLevel: 67,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => state.history,
  useSuspenseQuery: () => ({ data: state.mine }),
}));

beforeEach(() => {
  state.mine = {
    accrualEnabled: false,
    automaticRewards: [
      { amount: 10, level: 2 },
      { amount: 10, level: 3 },
    ],
    enabled: false,
    level: 1,
    nextLevelTotalXp: 67,
    pendingXp: 0,
    progress: 0,
    totalXp: 0,
    xpForNextLevel: 67,
  };
  state.history.isError = false;
  state.history.isPending = false;
});
vi.mock("@/lib/orpc", () => ({
  orpc: { progression: { getMine: { queryOptions: vi.fn() } } },
  orpcClient: { progression: { history: vi.fn() } },
}));

it("shows the dormant Spanish progression state without hiding level 1", () => {
  render(<ProgressionSection />);

  expect(screen.getByRole("heading", { name: "Progreso" })).toBeTruthy();
  expect(screen.getByText("Nivel 1")).toBeTruthy();
  expect(screen.getByText("0 XP")).toBeTruthy();
  expect(screen.getByText(/aún no está activo/i)).toBeTruthy();
});

it("renders settled, pending, and accessible next-level progress", () => {
  state.mine = {
    accrualEnabled: true,
    automaticRewards: [
      { amount: 10, level: 3 },
      { amount: 10, level: 4 },
    ],
    enabled: true,
    level: 2,
    nextLevelTotalXp: 133,
    pendingXp: 12,
    progress: 0.5,
    totalXp: 100,
    xpForNextLevel: 33,
  };
  render(<ProgressionSection />);

  expect(screen.getByText("Nivel 2")).toBeTruthy();
  expect(screen.getByText("100 XP")).toBeTruthy();
  expect(screen.getByText("12 XP pendientes")).toBeTruthy();
  const progress = screen.getByRole("progressbar", {
    name: "Progreso hacia el nivel 3",
  });
  expect(progress.getAttribute("aria-valuenow")).toBe("50");
  expect(screen.getByText("33 XP para el siguiente nivel")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Próximas recompensas automáticas" })
  ).toBeTruthy();
  expect(screen.getByText("Nivel 3: 10 Eteris")).toBeTruthy();
});

it("announces the max-level reward-track state accessibly", () => {
  state.mine = {
    accrualEnabled: true,
    automaticRewards: [],
    enabled: true,
    level: 1000,
    nextLevelTotalXp: null,
    pendingXp: 0,
    progress: 1,
    totalXp: 365_000,
    xpForNextLevel: null,
  };
  render(<ProgressionSection />);

  expect(screen.getByRole("status").textContent).toMatch(
    /nivel máximo alcanzado/i
  );
  expect(screen.getByText(/completaste todas las recompensas/i)).toBeTruthy();
});

it("distinguishes loading and failed private history requests", () => {
  state.mine = { ...state.mine, enabled: true };
  state.history.isPending = true;
  const view = render(<ProgressionSection />);
  expect(screen.getByRole("status").textContent).toMatch(/cargando historial/i);

  view.unmount();
  state.history.isPending = false;
  state.history.isError = true;
  render(<ProgressionSection />);
  expect(screen.getByRole("alert").textContent).toMatch(/no pudimos cargar/i);
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
});
