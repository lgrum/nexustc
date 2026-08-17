import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CollectibleCorrectionsClient } from "./corrections-client";

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
      corrections: {
        exceptionalGrant: { mutationOptions: state.mutationOptions },
        exceptionalTransfer: { mutationOptions: state.mutationOptions },
        reverseEteris: { mutationOptions: state.mutationOptions },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.mutateAsync.mockResolvedValue({ actionId: "action-1" });
});

it("wires exceptional grant, ownership transfer, and separate Eteris reversal controls", async () => {
  render(<CollectibleCorrectionsClient />);

  fireEvent.change(screen.getByLabelText("ID de plantilla"), {
    target: { value: "template-1" },
  });
  fireEvent.change(screen.getByLabelText("ID destinatario"), {
    target: { value: "user-1" },
  });
  fireEvent.change(screen.getByLabelText("Versión esperada de plantilla"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Motivo de emisión"), {
    target: { value: "Suministro comprometido" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Emitir corrección" }).closest("form")!
  );
  await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
  expect(state.mutateAsync).toHaveBeenNthCalledWith(1, {
    binding: "transferable",
    expectedVersion: 3,
    idempotencyKey: expect.stringMatching(/^collectibles-correction:grant:/),
    reason: "Suministro comprometido",
    targetUserId: "user-1",
    templateId: "template-1",
  });

  fireEvent.change(screen.getByLabelText("ID del activo"), {
    target: { value: "card-1" },
  });
  fireEvent.change(screen.getByLabelText("Propietario actual"), {
    target: { value: "from-user" },
  });
  fireEvent.change(screen.getByLabelText("Nuevo propietario"), {
    target: { value: "to-user" },
  });
  fireEvent.change(screen.getByLabelText("Motivo de transferencia"), {
    target: { value: "Propiedad documentada" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Transferir propiedad" })
      .closest("form")!
  );
  await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(2));
  expect(state.mutateAsync).toHaveBeenNthCalledWith(2, {
    assetId: "card-1",
    expectedVersion: 1,
    fromUserId: "from-user",
    idempotencyKey: expect.stringMatching(/^collectibles-correction:transfer:/),
    kind: "card",
    reason: "Propiedad documentada",
    toUserId: "to-user",
  });

  fireEvent.change(screen.getByLabelText("ID de transacción"), {
    target: { value: "eteris-1" },
  });
  fireEvent.change(screen.getByLabelText("Secuencia esperada"), {
    target: { value: "7" },
  });
  fireEvent.click(
    screen.getByLabelText(
      "Confirmo que la falla fue verificada por la plataforma."
    )
  );
  fireEvent.change(screen.getByLabelText("Motivo de reversión"), {
    target: { value: "Falla de liquidación verificada" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Revertir Eteris" }).closest("form")!
  );
  await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(3));
  expect(state.mutateAsync).toHaveBeenNthCalledWith(3, {
    expectedSequence: "7",
    failureCode: "settlement-failure",
    idempotencyKey: expect.stringMatching(
      /^collectibles-correction:eteris-reversal:/
    ),
    reason: "Falla de liquidación verificada",
    transactionId: "eteris-1",
    verifiedFailure: true,
  });
});
