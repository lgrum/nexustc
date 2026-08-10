import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { EconomyClient } from "./economy-client";

const state = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  report: {
    anomalousEarners: [{ total: "900", userId: "user-fast" }],
    balancePercentiles: { p50: "10", p90: "75", p99: "250" },
    burned: "25",
    burnedByReason: { account_closure: "25" },
    createdAt: "2026-08-07T12:00:00.000Z",
    day: "2026-08-07",
    frozenWalletCount: 2,
    issued: "100",
    issuedByReason: { vip_stipend: "100" },
    negativeWalletCount: 1,
    sourceSinkRatio: "4.00",
    totalUserSupply: "75",
  },
  role: "admin",
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    isPending: false,
    mutate: state.mutate,
    mutateAsync: state.mutate,
  }),
  useQuery: () => ({
    data: state.report,
    isError: false,
    isPending: false,
    refetch: state.refetch,
  }),
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { session: {}, user: { role: state.role } },
    }),
  },
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    eteris: {
      admin: {
        inspectWallet: {
          queryOptions: vi.fn(({ input }) => ({
            queryKey: ["wallet-audit", input.userId],
          })),
        },
        report: { queryOptions: vi.fn() },
      },
      owner: {
        adjust: { mutationOptions: vi.fn() },
        reconcileWallet: { mutationOptions: vi.fn() },
      },
    },
    progression: {
      admin: {
        inspectUser: {
          queryOptions: vi.fn(({ input }) => ({
            queryKey: ["xp-audit", input.userId],
          })),
        },
      },
      owner: { adjustXp: { mutationOptions: vi.fn() } },
    },
  },
}));

beforeEach(() => {
  state.invalidateQueries.mockReset().mockResolvedValue();
  state.mutate.mockReset();
  state.refetch.mockReset().mockResolvedValue();
  state.role = "admin";
});

it("shows authorized staff the complete daily economy report", () => {
  render(<EconomyClient initialReport={state.report} />);

  expect(
    screen.getByRole("heading", { name: "Economía de Eteris" })
  ).toBeTruthy();
  expect(screen.getByText(/informe diario UTC del 2026-08-07/i)).toBeTruthy();
  expect(screen.getByText("75 Eteris")).toBeTruthy();
  expect(screen.getAllByText("100 Eteris")).toHaveLength(2);
  expect(screen.getAllByText("25 Eteris")).toHaveLength(2);
  expect(screen.getByText("4.00")).toBeTruthy();
  expect(screen.getByText("1 negativa")).toBeTruthy();
  expect(screen.getByText("2 congeladas")).toBeTruthy();
  expect(screen.getByText("vip stipend")).toBeTruthy();
  expect(screen.getByText("account closure")).toBeTruthy();
  expect(screen.getByText(/P50: 10.*P90: 75.*P99: 250/)).toBeTruthy();
  expect(screen.getByText("user-fast")).toBeTruthy();
  expect(screen.getByText("900 Eteris")).toBeTruthy();
  expect(screen.queryByLabelText(/ID de usuario a reconciliar/)).toBeNull();
});

it("lets only an owner request wallet reconciliation", async () => {
  state.role = "owner";
  render(<EconomyClient initialReport={state.report} />);

  fireEvent.change(screen.getByLabelText(/ID de usuario a reconciliar/), {
    target: { value: "user-123" },
  });
  const submit = screen.getByRole("button", {
    name: "Reconciliar billetera",
  });
  await waitFor(() =>
    expect((submit as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(submit);

  await waitFor(() =>
    expect(state.mutate).toHaveBeenCalledWith({
      repair: true,
      userId: "user-123",
    })
  );
  await waitFor(() =>
    expect(state.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["xp-audit", "user-123"] }],
      [{ queryKey: ["wallet-audit", "user-123"] }],
    ])
  );
});

it("refreshes audited data after an owner adjustment", async () => {
  state.role = "owner";
  render(<EconomyClient initialReport={state.report} />);

  const xpCard = screen
    .getByRole("heading", { name: "Ajustar Account XP" })
    .closest('[data-slot="card"]')!;
  const xpUserInput = within(xpCard).getByLabelText(/ID de usuario/i);
  fireEvent.change(xpUserInput, { target: { value: "user-adjusted" } });
  fireEvent.change(within(xpCard).getByLabelText(/Cantidad firmada/i), {
    target: { value: "25" },
  });
  fireEvent.change(within(xpCard).getByLabelText(/Motivo de auditoría/i), {
    target: { value: "Ajuste de prueba autorizado" },
  });
  fireEvent.submit(xpUserInput.closest("form")!);

  await waitFor(() =>
    expect(state.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["xp-audit", "user-adjusted"] }],
      [{ queryKey: ["wallet-audit", "user-adjusted"] }],
    ])
  );
});

it("shows owner-only signed XP and Eteris adjustment forms", () => {
  state.role = "owner";
  render(<EconomyClient initialReport={state.report} />);

  expect(
    screen.getByRole("heading", { name: "Ajustar Account XP" })
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Ajustar Eteris" })).toBeTruthy();
});
