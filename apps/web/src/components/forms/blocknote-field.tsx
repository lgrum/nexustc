import { BlockNoteEditor } from "../blocknote-editor";
import { Label } from "../ui/label";
import { ErrorField } from "./error-field";
import { useFieldContext } from "./form-context";

export function BlockNoteField({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  const field = useFieldContext<string>();

  return (
    <div className="space-y-2">
      <Label htmlFor={field.name}>
        {label}
        {!!required && <span className="text-red-500">*</span>}
      </Label>
      <div className="overflow-hidden rounded-md border">
        <BlockNoteEditor
          id={field.name}
          onBlur={field.handleBlur}
          onChange={field.handleChange}
          value={field.state.value}
        />
      </div>
      <ErrorField field={field} />
    </div>
  );
}
