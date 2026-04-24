import { PATRON_TIER_GRADIENTS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useMemo } from "react";
import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type ReviewMarkdownProps = {
  children: string;
  patronTier?: PatronTier | null;
  className?: string;
};

function getTierContentStyle(tier: PatronTier | null | undefined) {
  if (!(tier && tier !== "none")) {
    return;
  }

  const gradient = PATRON_TIER_GRADIENTS[tier];

  return {
    background: [
      "linear-gradient(oklch(from var(--background) l c h / 0.66), oklch(from var(--background) l c h / 0.78)) padding-box",
      `${gradient} padding-box`,
      `${gradient} border-box`,
    ].join(", "),
  } satisfies CSSProperties;
}

export function ReviewMarkdown({
  children: review,
  patronTier,
  className,
}: ReviewMarkdownProps) {
  const tierContentStyle = useMemo(
    () => getTierContentStyle(patronTier),
    [patronTier]
  );

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none wrap-break-word [&_a]:text-primary",
        tierContentStyle &&
          "rounded-xl border-2 border-transparent p-4 shadow-sm",
        className
      )}
      role="document"
      style={tierContentStyle}
    >
      <ReactMarkdown
        components={{
          a: ({ children }) => <span>{children}</span>,
          img: () => null,
        }}
        disallowedElements={["img"]}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {review}
      </ReactMarkdown>
    </div>
  );
}
