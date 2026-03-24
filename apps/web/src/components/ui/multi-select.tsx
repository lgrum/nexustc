import {
  Cancel01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type MultiSelectContextType = {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedValues: Set<string>;
  toggleValue: (value: string) => void;
  items: Map<string, ReactNode>;
  onItemAdded: (value: string, label: ReactNode) => void;
};
const MultiSelectContext = createContext<MultiSelectContextType | null>(null);

export function MultiSelect({
  children,
  values,
  defaultValues,
  onValuesChange,
}: {
  children: ReactNode;
  values?: string[];
  defaultValues?: string[];
  onValuesChange?: (newValues: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState(
    new Set<string>(values ?? defaultValues)
  );
  const [items, setItems] = useState<Map<string, ReactNode>>(new Map());

  const toggleValue = useCallback(
    (value: string) => {
      const getNewSet = (prev: Set<string>) => {
        const newSet = new Set(prev);
        if (newSet.has(value)) {
          newSet.delete(value);
        } else {
          newSet.add(value);
        }
        return newSet;
      };
      setSelectedValues(getNewSet);
      onValuesChange?.([...getNewSet(selectedValues)]);
    },
    [onValuesChange, selectedValues]
  );

  const onItemAdded = useCallback((value: string, label: ReactNode) => {
    setItems((prev) => {
      if (prev.get(value) === label) {
        return prev;
      }
      return new Map(prev).set(value, label);
    });
  }, []);

  const value = useMemo(
    () => ({
      items,
      onItemAdded,
      open,
      selectedValues: values ? new Set(values) : selectedValues,
      setOpen,
      toggleValue,
    }),
    [values, items, selectedValues, toggleValue, open, onItemAdded]
  );

  return (
    <MultiSelectContext value={value}>
      <Popover onOpenChange={setOpen} open={open}>
        {children}
      </Popover>
    </MultiSelectContext>
  );
}

export function MultiSelectTrigger({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
} & ComponentPropsWithoutRef<typeof Button>) {
  const { open } = useMultiSelectContext();

  return (
    <PopoverTrigger
      {...props}
      aria-expanded={props["aria-expanded"] ?? open}
      className={cn(
        "flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-4xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:h-9 data-[size=sm]:h-8 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="select-trigger"
      role={props.role ?? "combobox"}
    >
      {children}
      <HugeiconsIcon className="size-4 opacity-50" icon={UnfoldMoreIcon} />
    </PopoverTrigger>
  );
}

export function MultiSelectValue({
  placeholder,
  clickToRemove = true,
  className,
  overflowBehavior = "wrap-when-open",
  ...props
}: {
  placeholder?: string;
  clickToRemove?: boolean;
  overflowBehavior?: "wrap" | "wrap-when-open" | "cutoff";
} & Omit<ComponentPropsWithoutRef<"div">, "children">) {
  const { selectedValues, toggleValue, items, open } = useMultiSelectContext();
  const [overflowAmount, setOverflowAmount] = useState(0);
  const valueRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Set<HTMLElement>>(new Set());

  const shouldWrap =
    overflowBehavior === "wrap" ||
    (overflowBehavior === "wrap-when-open" && open);

  useEffect(() => {
    if (!shouldWrap) {
      return;
    }
    for (const child of itemsRef.current) {
      child.style.removeProperty("display");
    }
  }, [shouldWrap]);

  const checkOverflow = useCallback(() => {
    if (valueRef.current === null) {
      return;
    }

    const containerElement = valueRef.current;
    const overflowElement = overflowRef.current;

    if (overflowElement !== null) {
      overflowElement.style.display = "none";
    }
    for (const child of itemsRef.current) {
      child.style.removeProperty("display");
    }
    let amount = 0;
    for (let i = itemsRef.current.size - 1; i >= 0; i -= 1) {
      const child = [...itemsRef.current][i];
      if (containerElement.scrollWidth <= containerElement.clientWidth) {
        break;
      }
      amount = itemsRef.current.size - i;
      child.style.display = "none";
      overflowElement?.style.removeProperty("display");
    }
    setOverflowAmount(amount);
  }, []);

  useEffect(() => {
    if (valueRef.current === null) {
      return;
    }

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(valueRef.current);

    return () => observer.disconnect();
  }, [checkOverflow]);

  useLayoutEffect(() => {
    checkOverflow();
  }, [checkOverflow]);

  if (selectedValues.size === 0 && placeholder) {
    return (
      <span className="font-normal text-muted-foreground">{placeholder}</span>
    );
  }

  return (
    <div
      {...props}
      className={cn(
        "flex w-full gap-1.5 overflow-hidden",
        shouldWrap && "h-full flex-wrap",
        className
      )}
      ref={valueRef}
    >
      {[...selectedValues]
        .filter((value) => items.has(value))
        .map((value) => (
          <Badge
            className="group flex items-center gap-1"
            key={value}
            onClick={
              clickToRemove
                ? (e) => {
                    e.stopPropagation();
                    toggleValue(value);
                  }
                : undefined
            }
            ref={(el) => {
              if (el === null) {
                return;
              }

              itemsRef.current.add(el);
              return () => {
                itemsRef.current.delete(el);
              };
            }}
            variant="outline"
          >
            {items.get(value)}
            {!!clickToRemove && (
              <HugeiconsIcon
                className="size-2 text-muted-foreground group-hover:text-destructive"
                icon={Cancel01Icon}
              />
            )}
          </Badge>
        ))}
      <Badge
        ref={overflowRef}
        style={{
          display: overflowAmount > 0 && !shouldWrap ? "block" : "none",
        }}
        variant="outline"
      >
        +{overflowAmount}
      </Badge>
    </div>
  );
}

export function MultiSelectContent({
  search = true,
  children,
  ...props
}: {
  search?: boolean | { placeholder?: string; emptyMessage?: string };
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<typeof Command>, "children">) {
  const canSearch = typeof search === "object" ? true : search;

  return (
    <>
      <div style={{ display: "none" }}>
        <Command>
          <CommandList>{children}</CommandList>
        </Command>
      </div>
      <PopoverContent className="min-w-(--radix-popover-trigger-width) p-0">
        <Command {...props}>
          {canSearch ? (
            <CommandInput
              placeholder={
                typeof search === "object" ? search.placeholder : undefined
              }
            />
          ) : (
            <button autoFocus className="sr-only" type="button" />
          )}
          <CommandList>
            {!!canSearch && (
              <CommandEmpty>
                {typeof search === "object" ? search.emptyMessage : undefined}
              </CommandEmpty>
            )}
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </>
  );
}

export function MultiSelectItem({
  value,
  children,
  badgeLabel,
  onSelect,
  ...props
}: {
  badgeLabel?: ReactNode;
  value: string;
} & Omit<ComponentPropsWithoutRef<typeof CommandItem>, "value">) {
  const { toggleValue, selectedValues, onItemAdded } = useMultiSelectContext();
  const isSelected = selectedValues.has(value);

  useEffect(() => {
    onItemAdded(value, badgeLabel ?? children);
  }, [value, children, onItemAdded, badgeLabel]);

  return (
    <CommandItem
      {...props}
      onSelect={(v) => {
        toggleValue(v);
        onSelect?.(v);
      }}
      value={value}
    >
      <HugeiconsIcon
        className={cn("mr-2 size-4", isSelected ? "opacity-100" : "opacity-0")}
        icon={Tick02Icon}
      />
      {children}
    </CommandItem>
  );
}

export function MultiSelectGroup(
  props: ComponentPropsWithoutRef<typeof CommandGroup>
) {
  return <CommandGroup {...props} />;
}

export function MultiSelectSeparator(
  props: ComponentPropsWithoutRef<typeof CommandSeparator>
) {
  return <CommandSeparator {...props} />;
}

function useMultiSelectContext() {
  const context = useContext(MultiSelectContext);
  if (context === null) {
    throw new Error(
      "useMultiSelectContext must be used within a MultiSelectContext"
    );
  }
  return context;
}
