import { ArrowDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AnyFieldApi } from "@tanstack/react-form";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";

import { ErrorField } from "@/components/forms/error-field";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function getDateValue(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getTimeValue(value: Date | string | null | undefined) {
  const date = getDateValue(value);
  if (!date) {
    return "";
  }

  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function mergeDateParts(params: { date: Date; timeSource?: Date | null }) {
  const nextDate = new Date(params.date);
  nextDate.setHours(
    params.timeSource?.getHours() ?? 0,
    params.timeSource?.getMinutes() ?? 0,
    params.timeSource?.getSeconds() ?? 0,
    0
  );
  return nextDate;
}

function mergeTimeParts(params: { date: Date; time: string }) {
  const [hours = 0, minutes = 0, seconds = 0] = params.time
    .split(":")
    .map((part) => Number(part));
  const nextDate = new Date(params.date);
  nextDate.setHours(hours, minutes, seconds, 0);
  return nextDate;
}

type ScheduledReleaseFieldProps = {
  disabled: boolean;
  errorField: AnyFieldApi;
  name: string;
  onChange: (value: Date | null) => void;
  value: Date | string | null | undefined;
};

export function ScheduledReleaseField({
  disabled,
  errorField,
  name,
  onChange,
  value,
}: ScheduledReleaseFieldProps) {
  const [open, setOpen] = useState(false);
  const date = getDateValue(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label htmlFor={`${name}-date`}>Fecha de publicación</Label>
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger
              render={
                <Button
                  className="h-10 w-48 justify-between font-normal"
                  disabled={disabled}
                  id={`${name}-date`}
                  type="button"
                  variant="outline"
                />
              }
            >
              {date ? format(date, "PPP", { locale: es }) : "Seleccionar fecha"}
              <HugeiconsIcon icon={ArrowDownIcon} />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-auto overflow-hidden p-0"
            >
              <Calendar
                captionLayout="dropdown"
                defaultMonth={date ?? undefined}
                mode="single"
                onSelect={(selectedDate) => {
                  if (!selectedDate) {
                    onChange(null);
                    return;
                  }

                  onChange(
                    mergeDateParts({
                      date: selectedDate,
                      timeSource: date,
                    })
                  );
                  setOpen(false);
                }}
                selected={date ?? undefined}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${name}-time`}>Hora</Label>
          <Input
            className="w-32 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            disabled={disabled || !date}
            id={`${name}-time`}
            onChange={(event) => {
              if (!date) {
                return;
              }

              onChange(mergeTimeParts({ date, time: event.target.value }));
            }}
            step="1"
            type="time"
            value={getTimeValue(value)}
          />
        </div>
        <Button
          disabled={disabled || !date}
          onClick={() => onChange(null)}
          type="button"
          variant="outline"
        >
          Ahora
        </Button>
      </div>
      <FieldDescription>
        Vacío publica ahora. Con fecha futura, el acceso se abre en ese momento.
      </FieldDescription>
      <ErrorField field={errorField} />
    </div>
  );
}
