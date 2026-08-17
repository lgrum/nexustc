import { fireEvent, render, screen } from "@testing-library/react";

import { CollectibleAuditClient } from "./audit-client";

const state = vi.hoisted(() => ({
  auditOptions: vi.fn((args: { input: { cursor?: string } }) => ({
    queryKey: ["collectible-audit", args.input],
  })),
  nextPage: {
    items: [
      {
        action: "restore",
        actionId: "action-2",
        after: {},
        before: {},
        createdAt: "2026-08-17T00:00:00.000Z",
        expectedVersion: 2,
        linkedActionId: null,
        linkedEterisTransactionId: null,
        reason: "Corrección confirmada",
        targetId: "card-1",
        targetKind: "card-instance",
        version: 3,
      },
    ],
    nextCursor: null,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: {
    initialData?: unknown;
    queryKey: [string, { cursor?: string }];
  }) => ({
    data:
      options.initialData ??
      (options.queryKey[1]?.cursor
        ? state.nextPage
        : { items: [], nextCursor: "cursor-1" }),
    isError: false,
    isFetching: false,
    isLoading: false,
  }),
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    collectiblesAdmin: {
      audit: { list: { queryOptions: state.auditOptions } },
    },
  },
}));

const initialAudit = {
  items: [
    {
      action: "freeze",
      actionId: "action-1",
      after: {},
      before: {},
      createdAt: "2026-08-17T00:00:01.000Z",
      expectedVersion: 1,
      linkedActionId: null,
      linkedEterisTransactionId: null,
      reason: "Incidente confirmado",
      targetId: "card-1",
      targetKind: "card-instance",
      version: 2,
    },
  ],
  nextCursor: "cursor-1",
} as never;

beforeEach(() => vi.clearAllMocks());

it("uses private filters and stable cursor controls for accessible audit pages", () => {
  render(<CollectibleAuditClient initialAudit={initialAudit} />);
  expect(state.auditOptions).toHaveBeenCalledWith({
    input: { cursor: undefined, limit: 25 },
  });
  expect(screen.getByRole("table")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Más antiguos" }));
  expect(state.auditOptions).toHaveBeenLastCalledWith({
    input: { cursor: "cursor-1", limit: 25 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Más recientes" }));

  fireEvent.change(screen.getByLabelText("Acción"), {
    target: { value: "freeze" },
  });
  fireEvent.change(screen.getByLabelText("ID objetivo"), {
    target: { value: "card-2" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Aplicar filtros" }).closest("form")!
  );
  expect(state.auditOptions).toHaveBeenLastCalledWith({
    input: {
      action: "freeze",
      cursor: undefined,
      limit: 25,
      targetId: "card-2",
    },
  });
});
