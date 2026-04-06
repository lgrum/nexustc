import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useEffectEvent, useRef } from "react";

import "@blocknote/shadcn/style.css";
import {
  EMPTY_BLOCK_NOTE_DOCUMENT,
  parseBlockNoteValue,
  serializeBlockNoteValue,
} from "@/lib/blocknote";

export function BlockNoteEditor({
  onChange,
  value = "",
  ...props
}: Omit<React.ComponentProps<typeof BlockNoteView>, "editor" | "onChange"> & {
  onChange?: (value: string) => void;
  value?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editor = useCreateBlockNote({
    dictionary: es,
    initialContent: EMPTY_BLOCK_NOTE_DOCUMENT,
  });

  const handleEditorChange = useEffectEvent(() => {
    onChange?.(serializeBlockNoteValue(editor));
  });

  useEffect(() => {
    const currentValue = serializeBlockNoteValue(editor);

    if (currentValue === value) {
      return;
    }

    editor.replaceBlocks(editor.document, parseBlockNoteValue(value, editor));
  }, [editor, value]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const normalizeButtonType = (element: Element) => {
      if (element instanceof HTMLButtonElement) {
        element.type = "button";
      }

      for (const button of element.querySelectorAll("button")) {
        button.type = "button";
      }
    };

    normalizeButtonType(container);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            normalizeButtonType(node);
          }
        }
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <BlockNoteView
      editor={editor}
      onChange={handleEditorChange}
      ref={containerRef}
      {...props}
    />
  );
}
