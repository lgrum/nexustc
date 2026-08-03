import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import MediaCropDialog from "./media-crop-dialog";

it("locks crop confirmation while async work is pending", async () => {
  let finishConfirm!: () => void;
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishConfirm = resolve;
      })
  );

  render(
    <MediaCropDialog
      description="Ajusta la imagen."
      imageSrc="blob:avatar"
      onConfirm={onConfirm}
      onOpenChange={vi.fn()}
      open
      title="Recortar avatar"
    />
  );

  fireEvent.load(screen.getByRole("img", { name: "Recortar avatar" }));
  const saveButton = screen.getByRole("button", {
    name: "Guardar recorte",
  });

  fireEvent.click(saveButton);
  fireEvent.click(saveButton);

  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Guardando recorte…" })
  ).toHaveProperty("disabled", true);

  finishConfirm();

  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Guardar recorte" })
    ).toHaveProperty("disabled", false)
  );
});
