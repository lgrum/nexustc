import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createContext, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "../ui/button";

export function SearchContainer({ children }: React.PropsWithChildren) {
  return <div className="flex w-full flex-col gap-4">{children}</div>;
}

export function SearchResults({ children }: React.PropsWithChildren) {
  return <div>{children}</div>;
}

const formContext = createContext<{
  filter: [boolean, React.Dispatch<React.SetStateAction<boolean>>];
} | null>(null);

export function SearchForm({
  children,
  ...props
}: React.PropsWithChildren<React.ComponentProps<"form">>) {
  const [openFilters, setOpenFilters] = useState(false);

  const value: ReturnType<typeof useFormContext> = useMemo(
    () => ({ filter: [openFilters, setOpenFilters] }),
    [openFilters, setOpenFilters]
  );

  return (
    <form {...props}>
      <formContext.Provider value={value}>{children}</formContext.Provider>
    </form>
  );
}

export function SearchFilters({ children }: React.PropsWithChildren<unknown>) {
  const {
    filter: [openFilters],
  } = useFormContext();

  if (!openFilters) {
    return null;
  }

  return <div className="flex flex-col gap-4">{children}</div>;
}

function useFormContext() {
  const context = useContext(formContext);

  if (!context) {
    throw new Error("useFormContext must be used within a SearchForm");
  }

  return context;
}

export function SearchFiltersButton({
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "children">) {
  const {
    filter: [openFilters, setOpenFilters],
  } = useFormContext();

  return (
    <Button
      className={cn("w-full", className)}
      onClick={() => setOpenFilters((prev) => !prev)}
      type="button"
      variant="outline"
      {...props}
    >
      <HugeiconsIcon
        className={cn("transition-transform", openFilters ? "rotate-180" : "")}
        icon={ArrowDown01Icon}
      />
      {openFilters ? "Ocultar Filtros" : "Mostrar Filtros"}
    </Button>
  );
}
