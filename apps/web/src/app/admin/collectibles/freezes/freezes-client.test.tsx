import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CollectibleFreezesClient } from "./freezes-client";

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  mutationOptions: vi.fn(() => ({})),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    isPending: false,
    mutateAsync: state.mutateAsync,
  }),
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    collectiblesAdmin: {
      freezes: {
        cardInstances: {
          freeze: { mutationOptions: state.mutationOptions },
          restore: { mutationOptions: state.mutationOptions },
        },
        packInstances: {
          freeze: { mutationOptions: state.mutationOptions },
          restore: { mutationOptions: state.mutationOptions },
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it("submits accessible freeze fields and keeps one idempotency key across a retry", async () => {
  state.mutateAsync
    .mockRejectedValueOnce(new Error("retryable"))
    .mockResolvedValueOnce({ actionId: "action-1" });
  render(<CollectibleFreezesClient />);

  fireEvent.change(screen.getByLabelText("ID del activo"), {
    target: { value: "card-1" },
  });
  fireEvent.change(screen.getByLabelText("Versión esperada"), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByLabelText("Custodia al congelar"), {
    target: { value: "release" },
  });
  fireEvent.change(screen.getByLabelText("Motivo"), {
    target: { value: "Custodia comprometida" },
  });
  const form = screen.getByRole("button", { name: "Congelar" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
  await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
  fireEvent.submit(form!);
  await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(2));

  expect(state.mutateAsync).toHaveBeenNthCalledWith(1, {
    assetId: "card-1",
    custody: "release",
    expectedVersion: 4,
    idempotencyKey: expect.stringMatching(/^collectibles-admin:card-freeze:/),
    reason: "Custodia comprometida",
  });
  expect(state.mutateAsync.mock.calls[0]?.[0].idempotencyKey).toBe(
    state.mutateAsync.mock.calls[1]?.[0].idempotencyKey
  );
  expect(screen.getByLabelText("ID del activo")).toBeTruthy();
});
