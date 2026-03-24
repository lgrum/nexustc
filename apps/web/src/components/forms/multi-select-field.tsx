import type React from "react";

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";

import { Label } from "../ui/label";
import { ErrorField } from "./error-field";
import { useFieldContext } from "./form-context";

export type SelectFieldOption = {
  value: string;
  label: string;
};

export function MultiSelectField(
  props: {
    label: string;
    required?: boolean;
    options: SelectFieldOption[];
    children?: React.ReactNode;
    className?: string;
  } & Omit<
    React.ComponentProps<typeof MultiSelect>,
    "value" | "onChange" | "children"
  > // Omit value and onChange as they are handled by the form
) {
  const field = useFieldContext<string[]>();

  return (
    <div className={cn("space-y-2", props.className)}>
      <Label htmlFor={field.name}>
        {props.label}
        {!!props.required && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex flex-row gap-4">
        <MultiSelect
          onValuesChange={(value) => field.handleChange(value)}
          values={field.state.value}
          {...props}
        >
          <MultiSelectTrigger className="w-full" id={field.name}>
            <MultiSelectValue
              placeholder={`Seleccionar ${props.label.toLowerCase()}`}
            />
          </MultiSelectTrigger>
          <MultiSelectContent>
            {props.options.map((option) => (
              <MultiSelectItem
                key={option.value}
                keywords={[option.label]}
                value={option.value}
              >
                {option.label}
              </MultiSelectItem>
            ))}
          </MultiSelectContent>
        </MultiSelect>
        {props.children}
      </div>
      <ErrorField field={field} />
    </div>
  );
}
