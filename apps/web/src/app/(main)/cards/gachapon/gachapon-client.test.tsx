import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GachaponClient } from "./gachapon-client";

const state = vi.hoisted(() => ({
  activate: vi.fn(),
  invalidateQueries: vi.fn(),
  machine: {
    availability: "available" as const,
    binding: "transferable" as const,
    cost: "25",
    description: "Evento",
    endsAt: null,
    entries: [
      {
        available: true,
        description: "Pack de prueba",
        latestRevision: {
          bindingPolicy: "either" as const,
          cardCount: 1,
          duplicatePolicy: "allow" as const,
          guarantees: [],
          possiblePool: [],
          publishedAt: null,
          revision: 2,
          unavailableCards: [],
        },
        name: "Pack inicial",
        packTemplateId: "pack-1",
      },
    ],
    globalQuota: null,
    id: "machine-1",
    name: "Máquina de evento",
    perAccountLimit: null,
    remainingGlobalActivations: null,
    startsAt: null,
    state: "active" as const,
    version: 4,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    isPending: false,
    mutateAsync: state.activate,
  }),
  useQuery: () => ({
    data: [state.machine],
    error: null,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue({ data: [state.machine] }),
  }),
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    gacha: {
      activate: { mutationOptions: vi.fn() },
      list: { queryOptions: vi.fn() },
    },
  },
}));

beforeEach(() => {
  state.activate.mockReset().mockResolvedValue({
    activationId: "activation-1",
    chargedCost: "25",
    machineId: "machine-1",
    packInstanceId: "pack-instance-1",
    replayed: false,
    revisionId: "revision-2",
    templateId: "pack-1",
    transactionId: "transaction-1",
  });
  state.invalidateQueries.mockReset().mockResolvedValue();
});

it("discloses possible Pack Templates without weights or hidden outcomes", () => {
  render(<GachaponClient initialMachines={[state.machine]} />);

  expect(screen.getByRole("heading", { name: "Gachapon" })).toBeTruthy();
  expect(screen.getByText("Pack inicial")).toBeTruthy();
  expect(screen.getByText("Revisión 2")).toBeTruthy();
  expect(screen.getByText(/no se muestran pesos/i)).toBeTruthy();
  expect(
    screen.queryByText(/hidden-card|cardInstance|selectedTemplateId/i)
  ).toBeNull();
});

it("submits only machine confirmation values and renders a private pack receipt", async () => {
  render(<GachaponClient initialMachines={[state.machine]} />);
  fireEvent.click(screen.getByRole("button", { name: "Activar máquina" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar activación" }));

  await waitFor(() =>
    expect(state.activate).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedCost: "25",
        expectedMachineVersion: 4,
        machineId: "machine-1",
      })
    )
  );
  expect(state.activate.mock.calls[0]?.[0]).not.toHaveProperty("outcome");
  expect(state.activate.mock.calls[0]?.[0]).not.toHaveProperty(
    "selectedTemplateId"
  );
  expect(screen.getByText("Pack emitido")).toBeTruthy();
  expect(screen.getByText("pack-instance-1")).toBeTruthy();
  expect(screen.queryByText("hidden-card-1")).toBeNull();
});
