import { Image01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PATRON_TIERS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const STICKER_TOKEN_REGEX = /\[sticker:\w[\w-]*\]/;

type StickerPickerProps = {
  onSelect: (token: string) => void;
  currentContent: string;
};

export function StickerPicker({
  onSelect,
  currentContent,
}: StickerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: stickers } = useQuery({
    enabled: open,
    queryFn: () => orpcClient.sticker.list(),
    queryKey: ["sticker-picker-list"],
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!stickers) {
      return [];
    }
    if (!search) {
      return stickers;
    }
    const q = search.toLowerCase();
    return stickers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q)
    );
  }, [stickers, search]);

  const handleSelect = (name: string) => {
    if (STICKER_TOKEN_REGEX.test(currentContent)) {
      toast.error("Solo un sticker por comentario");
      return;
    }
    onSelect(`[sticker:${name}]`);
    setOpen(false);
  };

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
        <HugeiconsIcon className="size-5" icon={Image01Icon} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 bg-popover/95 p-3 backdrop-blur-sm"
      >
        <InputGroup className="rounded-lg bg-background/80">
          <InputGroupInput
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar sticker..."
            type="text"
            value={search}
          />
          <InputGroupAddon>
            <HugeiconsIcon className="size-5" icon={SearchIcon} />
          </InputGroupAddon>
        </InputGroup>
        {filtered.length > 0 ? (
          <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-1">
            {filtered.map((s) => {
              if (s.locked) {
                return (
                  <Tooltip key={s.id}>
                    <TooltipTrigger
                      render={
                        <button
                          className="relative flex items-center justify-center rounded-lg p-2 opacity-40 transition-opacity hover:opacity-70"
                          type="button"
                        />
                      }
                    >
                      <img
                        alt={s.displayName}
                        className="size-24 object-contain"
                        loading="lazy"
                        src={getBucketUrl(s.assetKey)}
                      />
                      <span className="absolute right-1 bottom-1 text-xs opacity-60">
                        🔒
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Requiere membresía{" "}
                      {PATRON_TIERS[s.requiredTier as PatronTier]?.badge ??
                        s.requiredTier}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <button
                  className="flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-muted hover:shadow-[0_0_12px_rgba(var(--primary),0.3)]"
                  key={s.id}
                  onClick={() => handleSelect(s.name)}
                  type="button"
                >
                  <img
                    alt={s.displayName}
                    className="size-24 object-contain"
                    loading="lazy"
                    src={getBucketUrl(s.assetKey)}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-muted-foreground text-sm">
            {stickers ? "Sin resultados" : "Cargando stickers..."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
