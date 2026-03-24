import { SearchIcon, SmileIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PATRON_TIERS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type EmojiPickerProps = {
  onSelect: (token: string) => void;
};

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: emojis } = useQuery({
    enabled: open,
    queryFn: () => orpcClient.emoji.list(),
    queryKey: ["emoji-picker-list"],
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!emojis) {
      return [];
    }
    if (!search) {
      return emojis;
    }
    const q = search.toLowerCase();
    return emojis.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.displayName.toLowerCase().includes(q)
    );
  }, [emojis, search]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            type="button"
          />
        }
      >
        <HugeiconsIcon className="size-5" icon={SmileIcon} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 bg-popover/80 p-3 backdrop-blur"
      >
        <InputGroup className="rounded-lg bg-background/80">
          <InputGroupInput
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar emoji..."
            type="text"
            value={search}
          />
          <InputGroupAddon>
            <HugeiconsIcon className="size-5" icon={SearchIcon} />
          </InputGroupAddon>
        </InputGroup>
        {filtered.length > 0 ? (
          <div className="grid max-h-48 grid-cols-7 gap-1 overflow-y-auto p-1">
            {filtered.map((e) =>
              e.locked ? (
                <Tooltip key={e.id}>
                  <TooltipTrigger
                    render={
                      <button
                        className="relative flex items-center justify-center rounded-lg p-1 opacity-40 transition-opacity hover:opacity-70"
                        type="button"
                      />
                    }
                  >
                    <img
                      alt={e.displayName}
                      className="size-8"
                      loading="lazy"
                      src={getBucketUrl(e.assetKey)}
                    />
                    <span className="absolute right-0 bottom-0 z-1 text-[8px]">
                      🔒
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Requiere membresía{" "}
                    {PATRON_TIERS[e.requiredTier as PatronTier]?.badge ??
                      e.requiredTier}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button
                  className="flex items-center justify-center rounded-lg p-1 transition-colors hover:bg-muted hover:shadow-[0_0_12px_rgba(var(--primary),0.3)]"
                  key={e.id}
                  onClick={() => {
                    onSelect(`:${e.name}:`);
                  }}
                  type="button"
                >
                  <img
                    alt={e.displayName}
                    className="size-8"
                    loading="lazy"
                    src={getBucketUrl(e.assetKey)}
                  />
                </button>
              )
            )}
          </div>
        ) : (
          <p className="py-4 text-center text-muted-foreground text-sm">
            {emojis ? "Sin resultados" : "Cargando emojis..."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
