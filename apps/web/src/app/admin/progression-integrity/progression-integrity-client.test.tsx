import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProgressionIntegrityClient } from "./progression-integrity-client";

const state = vi.hoisted(() => ({
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
      ? { data: options.initialData, refetch: state.refetch }
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
    input: { limit: 50, status: "open" },
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
