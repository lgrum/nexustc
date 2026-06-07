import ReactMarkdown from "react-markdown";

function isExternalLink(href: string | undefined) {
  return /^https?:\/\//i.test(href ?? "");
}

export function Markdown({ children }: { children: string }) {
  return (
    <div
      className="prose dark:prose-invert wrap-break-word w-full max-w-full [&_a]:text-primary"
      role="document"
    >
      <ReactMarkdown
        components={{
          a: ({ children: linkChildren, href }) => {
            if (isExternalLink(href)) {
              return (
                <a href={href} rel="noopener noreferrer" target="_blank">
                  {linkChildren}
                </a>
              );
            }

            return <a href={href}>{linkChildren}</a>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
