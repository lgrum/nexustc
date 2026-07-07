import Image from "next/image";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Block = {
  children?: Block[];
  content?: unknown;
  id?: string;
  props?: Record<string, unknown>;
  type?: string;
};

type InlineContent = {
  content?: unknown;
  href?: unknown;
  styles?: Record<string, unknown>;
  text?: unknown;
  type?: unknown;
};

function safeUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return /^(https?:|mailto:|\/)/.test(value) ? value : "";
}

function renderStyledText(
  text: string,
  styles: Record<string, unknown>,
  key: string
) {
  let content: ReactNode = text;

  if (styles.code) {
    content = <code>{content}</code>;
  }
  if (styles.bold) {
    content = <strong>{content}</strong>;
  }
  if (styles.italic) {
    content = <em>{content}</em>;
  }
  if (styles.underline) {
    content = <u>{content}</u>;
  }
  if (styles.strike) {
    content = <s>{content}</s>;
  }

  return <span key={key}>{content}</span>;
}

function renderInlineContent(value: unknown, keyPrefix: string): ReactNode {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      return item;
    }
    if (!item || typeof item !== "object") {
      return null;
    }

    const inline = item as InlineContent;
    const key = `${keyPrefix}-${index}`;

    if (inline.type === "link") {
      const href = safeUrl(inline.href);
      const content = renderInlineContent(inline.content, key);
      return href ? (
        <a href={href} key={key} rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        content
      );
    }

    return renderStyledText(
      typeof inline.text === "string" ? inline.text : "",
      inline.styles ?? {},
      key
    );
  });
}

function renderChildren(block: Block) {
  if (!block.children?.length) {
    return null;
  }

  return (
    <div className="ml-5 border-border/70 border-l pl-4">
      {block.children.map(renderBlock)}
    </div>
  );
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = block.id ?? `${block.type ?? "block"}-${index}`;
  const content = renderInlineContent(block.content, key);
  const children = renderChildren(block);

  switch (block.type) {
    case "heading": {
      const level = Number(block.props?.level);
      if (level === 1) {
        return (
          <div key={key}>
            <h2>{content}</h2>
            {children}
          </div>
        );
      }
      if (level === 2) {
        return (
          <div key={key}>
            <h3>{content}</h3>
            {children}
          </div>
        );
      }
      return (
        <div key={key}>
          <h4>{content}</h4>
          {children}
        </div>
      );
    }
    case "bulletListItem": {
      return (
        <ul key={key}>
          <li>{content}</li>
          {children}
        </ul>
      );
    }
    case "numberedListItem": {
      return (
        <ol key={key}>
          <li>{content}</li>
          {children}
        </ol>
      );
    }
    case "checkListItem": {
      return (
        <label className="flex items-start gap-2" key={key}>
          <input
            checked={block.props?.checked === true}
            className="mt-1"
            disabled
            readOnly
            type="checkbox"
          />
          <span>{content}</span>
        </label>
      );
    }
    case "quote": {
      return <blockquote key={key}>{content}</blockquote>;
    }
    case "codeBlock": {
      return (
        <pre key={key}>
          <code>{content}</code>
        </pre>
      );
    }
    case "divider": {
      return <hr key={key} />;
    }
    case "image": {
      const src = safeUrl(block.props?.url);
      if (!src) {
        return null;
      }
      const width = Number(block.props?.previewWidth) || 1200;
      return (
        <figure key={key}>
          <Image
            alt={
              typeof block.props?.caption === "string"
                ? block.props.caption
                : ""
            }
            className="h-auto max-w-full rounded-lg"
            height={Math.round(width * 0.5625)}
            sizes="(min-width: 1280px) 848px, 100vw"
            src={src}
            width={width}
          />
          {typeof block.props?.caption === "string" &&
          block.props.caption.length > 0 ? (
            <figcaption>{block.props.caption}</figcaption>
          ) : null}
        </figure>
      );
    }
    case "video": {
      const src = safeUrl(block.props?.url);
      return src ? (
        <video
          aria-label="Video adjunto"
          className="w-full rounded-lg"
          controls
          key={key}
          src={src}
        >
          <track kind="captions" />
        </video>
      ) : null;
    }
    case "audio": {
      const src = safeUrl(block.props?.url);
      return src ? (
        <audio aria-label="Audio adjunto" controls key={key} src={src}>
          <track kind="captions" />
        </audio>
      ) : null;
    }
    case "file": {
      const href = safeUrl(block.props?.url);
      return href ? (
        <a href={href} key={key} rel="noopener noreferrer">
          {typeof block.props?.name === "string"
            ? block.props.name
            : "Descargar archivo"}
        </a>
      ) : null;
    }
    default: {
      return (
        <div key={key}>
          <p>{content}</p>
          {children}
        </div>
      );
    }
  }
}

function parseBlocks(value: string): Block[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Block[]) : null;
  } catch {
    return null;
  }
}

export function BlockNoteContent({ value }: { value: string }) {
  const blocks = parseBlocks(value);

  return (
    <div className="prose prose-invert max-w-none overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/70 p-6 md:p-8">
      {blocks ? (
        blocks.map(renderBlock)
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      )}
    </div>
  );
}
