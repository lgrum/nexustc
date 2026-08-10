import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProgressionIntegrityClient } from "./progression-integrity-client";

const state = vi.hoisted(() => ({
  caseRows: [] as unknown[],
  getCaseOptions: vi.fn(() => ({ queryKey: ["case"] })),
  listCasesOptions: vi.fn(() => ({ queryKey: ["cases"] })),
  mutate: vi.fn(),
  mutationOptions: vi.fn(() => ({})),
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, mutate: state.mutate }),
  useQuery: (options: { initialData?: unknown; queryKey: string[] }) =>
    options.queryKey[0] === "cases"
      ? { data: options.initialData ?? state.caseRows, refetch: state.refetch }
      : {
          data: {
            evidence: { signals: [] },
            events: [
              {
                amount: 10,
                id: "event-1",
                kind: "comic_reading",
                state: "pending",
              },
            ],
            summary: "Actividad inusual",
          },
        },
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    progression: {
      admin: {
        decideCase: { mutationOptions: state.mutationOptions },
        getCase: { queryOptions: state.getCaseOptions },
        listCases: { queryOptions: state.listCasesOptions },
      },
    },
  },
}));

const cases = [
  {
    autoReleaseAt: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    id: "case-1",
    riskLevel: "high",
    status: "open",
    summary: "Actividad inusual",
    userId: "user-1",
  },
] as never;

beforeEach(() => vi.clearAllMocks());

it("uses generated options and submits a validated integrity decision", async () => {
  render(<ProgressionIntegrityClient initialCases={cases} />);

  expect(state.listCasesOptions).toHaveBeenCalledWith({
    input: { cursor: undefined, limit: 50, status: "open" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Actividad inusual/ }));
  expect(state.getCaseOptions).toHaveBeenLastCalledWith({
    input: { caseId: "case-1" },
  });

  fireEvent.change(screen.getByLabelText(/Motivo de la decisión/), {
    target: { value: "Revisión manual aprobada" },
  });
  const release = screen.getByRole("button", { name: "Liberar XP" });
  await waitFor(() =>
    expect((release as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(release);

  expect(state.mutate).toHaveBeenCalledWith({
    action: "release",
    caseId: "case-1",
    reason: "Revisión manual aprobada",
  });
});

it("exposes released cases and uses a stable cursor for older pages", () => {
  const fullPage = Array.from({ length: 50 }, (_, index) => ({
    ...cases[0],
    createdAt: `2026-08-07T00:00:${String(index).padStart(2, "0")}.000Z`,
    id: `case-${index}`,
  })) as never;
  render(<ProgressionIntegrityClient initialCases={fullPage} />);

  fireEvent.change(screen.getByLabelText("Estado"), {
    target: { value: "released" },
  });
  expect(state.listCasesOptions).toHaveBeenLastCalledWith({
    input: { cursor: undefined, limit: 50, status: "released" },
  });

  fireEvent.change(screen.getByLabelText("Estado"), {
    target: { value: "open" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Más antiguos" }));
  expect(state.listCasesOptions).toHaveBeenLastCalledWith({
    input: {
      cursor: {
        createdAt: "2026-08-07T00:00:49.000Z",
        id: "case-49",
      },
      limit: 50,
      status: "open",
    },
  });
});
