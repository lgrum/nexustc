import { PATRON_TIER_GRADIENTS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { renderTokenizedContent } from "@repo/shared/token-parser";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { CSSProperties } from "react";

import { orpcClient } from "@/lib/orpc";
import { cn, getBucketUrl } from "@/lib/utils";

import { AnimatedAsset } from "./animated-asset";

type CommentContentProps = {
  className?: string;
  content: string;
  emojiMap: Map<
    string,
    { assetKey: string; type: string; displayName: string }
  >;
  stickerMap: Map<
    string,
    { assetKey: string; type: string; displayName: string }
  >;
  patronTier?: PatronTier | null;
};

function getTierContentStyle(tier: PatronTier | null | undefined) {
  if (!(tier && tier !== "none")) {
    return;
  }

  const gradient = PATRON_TIER_GRADIENTS[tier ?? "none"];

  return {
    background: [
      "linear-gradient(oklch(from var(--background) l c h / 0.66), oklch(from var(--background) l c h / 0.78)) padding-box",
      `${gradient} padding-box`,
      `${gradient} border-box`,
    ].join(", "),
  } satisfies CSSProperties;
}

export function CommentContent({
  className,
  content,
  emojiMap,
  patronTier,
  stickerMap,
}: CommentContentProps) {
  const segments = useMemo(() => renderTokenizedContent(content), [content]);
  const tierContentStyle = useMemo(
    () => getTierContentStyle(patronTier),
    [patronTier]
  );

  return (
    <div
      className={cn(
        "text-foreground/90 text-base leading-relaxed",
        tierContentStyle &&
          "rounded-xl border-2 border-transparent p-4 shadow-sm",
        className
      )}
      style={tierContentStyle}
    >
      {segments.map((segment, i) => {
        const key =
          segment.type === "text"
            ? `t-${i}`
            : `${segment.type}-${segment.name}-${i}`;

        if (segment.type === "text") {
          return <span key={key}>{segment.content}</span>;
        }

        if (segment.type === "emoji") {
          const emojiData = emojiMap.get(segment.name);
          if (!emojiData) {
            return <span key={key}>:{segment.name}:</span>;
          }

          const src = getBucketUrl(emojiData.assetKey);
          if (emojiData.type === "animated") {
            return (
              <AnimatedAsset
                alt={emojiData.displayName}
                className="inline size-6 align-middle"
                key={key}
                src={src}
              />
            );
          }
          return (
            <img
              alt={emojiData.displayName}
              className="inline size-8 align-middle"
              key={key}
              loading="lazy"
              src={src}
            />
          );
        }

        if (segment.type === "sticker") {
          const stickerData = stickerMap.get(segment.name);
          if (!stickerData) {
            return <span key={key}>[sticker:{segment.name}]</span>;
          }

          const src = getBucketUrl(stickerData.assetKey);
          if (stickerData.type === "animated") {
            return (
              <AnimatedAsset
                alt={stickerData.displayName}
                className="mx-auto my-2 block h-40 w-40 object-contain"
                key={key}
                src={src}
              />
            );
          }
          return (
            <img
              alt={stickerData.displayName}
              className="my-2 block h-40 w-40 object-contain"
              key={key}
              loading="lazy"
              src={src}
            />
          );
        }

        return null;
      })}
    </div>
  );
}

export function useEmojiStickerMaps() {
  const emojiQuery = useQuery({
    queryFn: () => orpcClient.emoji.list(),
    queryKey: ["emojis-for-rendering"],
    staleTime: 5 * 60 * 1000,
  });

  const stickerQuery = useQuery({
    queryFn: () => orpcClient.sticker.list(),
    queryKey: ["stickers-for-rendering"],
    staleTime: 5 * 60 * 1000,
  });

  const emojiMap = useMemo(() => {
    const map = new Map<
      string,
      { assetKey: string; type: string; displayName: string }
    >();
    for (const e of emojiQuery.data ?? []) {
      map.set(e.name, {
        assetKey: e.assetKey,
        displayName: e.displayName,
        type: e.type,
      });
    }
    return map;
  }, [emojiQuery.data]);

  const stickerMap = useMemo(() => {
    const map = new Map<
      string,
      { assetKey: string; type: string; displayName: string }
    >();
    for (const s of stickerQuery.data ?? []) {
      map.set(s.name, {
        assetKey: s.assetKey,
        displayName: s.displayName,
        type: s.type,
      });
    }
    return map;
  }, [stickerQuery.data]);

  return { emojiMap, stickerMap };
}
