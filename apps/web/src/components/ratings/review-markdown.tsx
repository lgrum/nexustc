import { PATRON_TIER_GRADIENTS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useMemo } from "react";
import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";

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

/**
 * Restricted markdown renderer for reviews.
 * Only allows: bold, italic, links, lists
 * Disallows: headings, images, code blocks
 */
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
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          h4: ({ children }) => <p className="font-semibold">{children}</p>,
          h5: ({ children }) => <p className="font-semibold">{children}</p>,
          h6: ({ children }) => <p className="font-semibold">{children}</p>,
          img: () => null,
          code: ({ children }) => (
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
              {children}
            </span>
          ),
          pre: ({ children }) => <span>{children}</span>,
          a: ({ href, children }) => (
            <a
              className="text-primary underline hover:text-primary/80"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
        }}
      >
        {review}
      </ReactMarkdown>
    </div>
  );
}
