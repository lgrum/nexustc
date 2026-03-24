import { cn } from "@/lib/utils";

import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { ErrorField } from "./error-field";
import { useFieldContext } from "./form-context";

export function TextareaField({
  label,
  containerClassName,
  ...props
}: {
  label: string;
  containerClassName?: string;
} & React.ComponentProps<"textarea">) {
  const field = useFieldContext<string>();

  return (
    <div className={cn("space-y-2", containerClassName)}>
      <Label htmlFor={field.name}>{label}</Label>
      <Textarea
        id={field.name}
        onChange={(e) => field.handleChange(e.target.value)}
        value={field.state.value}
        {...props}
      />
      <ErrorField field={field} />
    </div>
  );
}
