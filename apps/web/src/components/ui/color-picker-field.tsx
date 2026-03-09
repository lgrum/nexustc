import { cn } from "@/lib/utils";

export function ColorPickerField({
  id,
  label,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 text-sm", className)}>
      <label className="font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="group relative">
        <div className="flex h-14 items-center gap-3 rounded-2xl border border-input bg-background px-3 transition-colors group-focus-within:border-ring group-focus-within:ring-2 group-focus-within:ring-ring/30">
          <div
            aria-hidden="true"
            className="size-8 rounded-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
            style={{ backgroundColor: value }}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">Seleccionar color</span>
            <span className="truncate font-mono text-muted-foreground text-xs uppercase">
              {value}
            </span>
          </div>
        </div>
        <input
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={value}
        />
      </div>
    </div>
  );
}
