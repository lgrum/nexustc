import type React from "react";

import { cn } from "@/lib/utils";

import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ErrorField } from "./error-field";
import { useFieldContext } from "./form-context";

export function TextField(
  props: {
    label: string;
    required?: boolean;
    children?: React.ReactNode;
  } & React.ComponentProps<"input">
) {
  const field = useFieldContext<string>();
  const { children, className, ...inputProps } = props;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={field.name}>
        {props.label}
        {!!props.required && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex flex-row gap-4">
        <Input
          id={field.name}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={props.label}
          type="text"
          value={field.state.value}
          {...inputProps}
        />
        {children}
      </div>
      <ErrorField field={field} />
    </div>
  );
}
