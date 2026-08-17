import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CollectibleOfferClosureClient } from "./offer-closure-client";

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  mutationOptions: vi.fn(() => ({})),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, mutateAsync: state.mutateAsync }),
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    collectiblesAdmin: {
      offers: {
        gifts: { cancel: { mutationOptions: state.mutationOptions } },
        trades: { cancel: { mutationOptions: state.mutationOptions } },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.mutateAsync.mockResolvedValue({ actionId: "action-1" });
});

it("submits administrative trade and gift closures with versions, reasons, and retry keys", async () => {
  render(<CollectibleOfferClosureClient />);
  fireEvent.change(screen.getByLabelText("ID de oferta"), {
    target: { value: "trade-1" },
  });
  fireEvent.change(screen.getByLabelText("Motivo del intercambio"), {
    target: { value: "Cierre administrativo" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Cerrar intercambio" }).closest("form")!
  );
  await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
  expect(state.mutateAsync).toHaveBeenNthCalledWith(1, {
    expectedVersion: 1,
    idempotencyKey: expect.stringMatching(/^collectibles-admin:trade-cancel:/),
    offerId: "trade-1",
    reason: "Cierre administrativo",
  });

  fireEvent.change(screen.getByLabelText("ID de regalo"), {
    target: { value: "gift-1" },
  });
  fireEvent.change(screen.getByLabelText("Motivo del regalo"), {
    target: { value: "Cierre de regalo" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Cerrar regalo" }).closest("form")!
  );
  await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(2));
  expect(state.mutateAsync).toHaveBeenNthCalledWith(2, {
    expectedVersion: 1,
    giftId: "gift-1",
    idempotencyKey: expect.stringMatching(/^collectibles-admin:gift-cancel:/),
    reason: "Cierre de regalo",
  });
});
