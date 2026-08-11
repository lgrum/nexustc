import { render, screen } from "@testing-library/react";

import { EterisSection } from "./eteris-section";

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
    balance: "0",
    canSpend: false,
    debt: false,
    enabled: false,
    publicBalance: false,
    spendingEnabled: false,
    status: "active" as const,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => state.history,
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useSuspenseQuery: () => ({ data: state.mine }),
}));
vi.mock("@/lib/orpc", () => ({
  orpc: { eteris: { getMine: { queryOptions: vi.fn() } } },
  orpcClient: {
    eteris: { history: vi.fn(), setPublicBalance: vi.fn() },
  },
}));

beforeEach(() => {
  state.mine = {
    balance: "0",
    canSpend: false,
    debt: false,
    enabled: false,
    publicBalance: false,
    spendingEnabled: false,
    status: "active",
  };
  state.history.data = { pages: [{ items: [], nextCursor: null }] };
  state.history.isError = false;
  state.history.isPending = false;
});

test("shows the dormant private Spanish wallet at an exact decimal-string balance", () => {
  render(<EterisSection />);

  expect(screen.getByRole("heading", { name: "Billetera" })).toBeTruthy();
  expect(screen.getByText("0 Eteris")).toBeTruthy();
  expect(screen.getByText(/a\u00FAn no est\u00E1 activa/i)).toBeTruthy();
  expect(screen.getByRole("switch").getAttribute("aria-disabled")).toBe("true");
  expect(screen.queryByText("Historial de Eteris")).toBeNull();
});

test("distinguishes debt and spending-disabled states while retaining history", () => {
  state.mine = {
    balance: "-12",
    canSpend: false,
    debt: true,
    enabled: true,
    publicBalance: false,
    spendingEnabled: false,
    status: "active",
  };
  state.history.data = {
    pages: [
      {
        items: [
          {
            amount: "-12",
            balanceAfter: "-12",
            createdAt: "2026-08-07T00:00:00.000Z",
            id: "tx-1",
            kind: "admin_adjustment",
            label: "Correcci\u00F3n del propietario",
          },
        ],
        nextCursor: null,
      },
    ],
  };

  render(<EterisSection />);

  expect(screen.getByText(/saldo est\u00E1 en deuda/i)).toBeTruthy();
  expect(screen.getByText("Historial de Eteris")).toBeTruthy();
  expect(screen.getByText("Correcci\u00F3n del propietario")).toBeTruthy();
  expect(screen.getByText("-12", { selector: "span" })).toBeTruthy();
});

test("shows frozen state and private-history failures", () => {
  state.mine = {
    ...state.mine,
    enabled: true,
    status: "frozen",
  };
  state.history.isError = true;

  render(<EterisSection />);

  expect(screen.getByText(/Billetera est\u00E1 congelada/i)).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toMatch(/no pudimos cargar/i);
});
