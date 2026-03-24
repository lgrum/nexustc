import { useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";

export function ErrorField({ field }: { field: AnyFieldApi }) {
  const errors = useStore(field.store, (state) => state.meta.errors);

  if (!errors.length) {
    return null;
  }

  return (
    <p className="text-destructive text-sm">
      {errors.map((error) => error.message).join(", ")}
    </p>
  );
}
