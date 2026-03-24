import type React from "react";

import { cn } from "@/lib/utils";

import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ErrorField } from "./error-field";
import { useFieldContext } from "./form-context";

export type SelectFieldOption = {
  value: string;
  label: string;
};

export function SelectField(
  props: {
    label: string;
    required?: boolean;
    options: SelectFieldOption[];
    children?: React.ReactNode;
    className?: string;
  } & Omit<React.ComponentProps<typeof Select>, "value" | "onChange"> // Omit value and onChange as they are handled by the form
) {
  const field = useFieldContext<string>();

  return (
    <div className={cn("space-y-2", props.className)}>
      <Label htmlFor={field.name}>
        {props.label}
        {!!props.required && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex flex-row gap-4">
        <Select
          items={props.options}
          onValueChange={(value) => field.handleChange(value as string)}
          value={field.state.value}
          {...props}
        >
          <SelectTrigger className="w-full" id={field.name}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {props.children}
      </div>
      <ErrorField field={field} />
    </div>
  );
}
