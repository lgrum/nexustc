import ReactMarkdown from "react-markdown";

type ReviewMarkdownProps = {
  children: string;
};

/**
 * Restricted markdown renderer for reviews.
 * Only allows: bold, italic, links, lists
 * Disallows: headings, images, code blocks
 */
export function ReviewMarkdown({ children: review }: ReviewMarkdownProps) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none wrap-break-word [&_a]:text-primary"
      role="document"
    >
      <ReactMarkdown
        components={{
          // Disable headings - render as regular paragraphs
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          h4: ({ children }) => <p className="font-semibold">{children}</p>,
          h5: ({ children }) => <p className="font-semibold">{children}</p>,
          h6: ({ children }) => <p className="font-semibold">{children}</p>,
          // Disable images
          img: () => null,
          // Disable code blocks
          code: ({ children }) => (
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
              {children}
            </span>
          ),
          pre: ({ children }) => <span>{children}</span>,
          // Add rel="noopener" to links
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
