import type React from "react";

import { Button } from "../ui/button";
import { useFormContext } from "./form-context";

export function SubmitButton(
  props: Omit<React.ComponentProps<typeof Button>, "type">
) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <Button
          {...props}
          disabled={!canSubmit}
          loading={isSubmitting}
          type="submit"
        />
      )}
    </form.Subscribe>
  );
}
