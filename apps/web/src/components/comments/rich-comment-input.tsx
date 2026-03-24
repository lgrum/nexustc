import { renderTokenizedContent } from "@repo/shared/token-parser";
import { useCallback, useEffect, useRef } from "react";

import { cn, getBucketUrl } from "@/lib/utils";

type AssetData = {
  assetKey: string;
  type: string;
  displayName: string;
};

type RichCommentInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  emojiMap: Map<string, AssetData>;
  stickerMap: Map<string, AssetData>;
};

function serializeToTokens(editor: HTMLDivElement): string {
  let result = "";
  for (const node of editor.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? "";
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node instanceof HTMLElement
    ) {
      result +=
        node.tagName === "IMG" && node.dataset.token
          ? node.dataset.token
          : (node.textContent ?? "");
    }
  }
  return result;
}

function createTokenImage(
  src: string,
  token: string,
  alt: string,
  isSticker: boolean
): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.dataset.token = token;
  img.contentEditable = "false";
  img.draggable = false;
  img.className = isSticker
    ? "my-1 block h-20 w-20 object-contain"
    : "inline size-6 align-middle";
  return img;
}

export function RichCommentInput({
  value,
  onChange,
  placeholder = "",
  className,
  emojiMap,
  stickerMap,
}: RichCommentInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  const renderToDOM = useCallback(
    (editor: HTMLDivElement, content: string) => {
      editor.innerHTML = "";

      if (!content) {
        return;
      }

      const segments = renderTokenizedContent(content);

      for (const segment of segments) {
        if (segment.type === "text") {
          editor.append(document.createTextNode(segment.content));
          continue;
        }

        if (segment.type === "emoji") {
          const data = emojiMap.get(segment.name);
          if (data) {
            editor.append(
              createTokenImage(
                getBucketUrl(data.assetKey),
                `:${segment.name}:`,
                data.displayName,
                false
              )
            );
          } else {
            editor.append(document.createTextNode(`:${segment.name}:`));
          }
          continue;
        }

        if (segment.type === "sticker") {
          const data = stickerMap.get(segment.name);
          if (data) {
            editor.append(
              createTokenImage(
                getBucketUrl(data.assetKey),
                `[sticker:${segment.name}]`,
                data.displayName,
                true
              )
            );
          } else {
            editor.append(document.createTextNode(`[sticker:${segment.name}]`));
          }
        }
      }
    },
    [emojiMap, stickerMap]
  );

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    renderToDOM(editor, value);

    if (value) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [value, renderToDOM]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    isInternalChange.current = true;
    onChange(serializeToTokens(editor));
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      if (e.key !== "Backspace" && e.key !== "Delete") {
        return;
      }

      const selection = window.getSelection();
      if (!selection?.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      const { startContainer, startOffset } = range;

      let targetImg: HTMLImageElement | null = null;

      if (e.key === "Backspace") {
        if (startContainer === editor) {
          const prev = editor.childNodes[startOffset - 1];
          if (prev instanceof HTMLImageElement && prev.dataset.token) {
            targetImg = prev;
          }
        } else if (
          startContainer.nodeType === Node.TEXT_NODE &&
          startOffset === 0
        ) {
          const prev = startContainer.previousSibling;
          if (prev instanceof HTMLImageElement && prev.dataset.token) {
            targetImg = prev;
          }
        }
      } else if (e.key === "Delete") {
        if (startContainer === editor) {
          const next = editor.childNodes[startOffset];
          if (next instanceof HTMLImageElement && next.dataset.token) {
            targetImg = next;
          }
        } else if (
          startContainer.nodeType === Node.TEXT_NODE &&
          startOffset === (startContainer.textContent?.length ?? 0)
        ) {
          const next = startContainer.nextSibling;
          if (next instanceof HTMLImageElement && next.dataset.token) {
            targetImg = next;
          }
        }
      }

      if (targetImg) {
        e.preventDefault();
        targetImg.remove();
        isInternalChange.current = true;
        onChange(serializeToTokens(editor));
      }
    },
    [onChange]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      const selection = window.getSelection();
      if (!selection?.rangeCount) {
        return;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      handleInput();
    },
    [handleInput]
  );

  return (
    <div
      aria-multiline="true"
      aria-placeholder={placeholder}
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2 text-sm shadow-none outline-none ring-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent",
        "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(aria-placeholder)]",
        className
      )}
      contentEditable
      data-slot="input-group-control"
      data-slot-type="rich-input"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      ref={editorRef}
      role="textbox"
      suppressContentEditableWarning
    />
  );
}
