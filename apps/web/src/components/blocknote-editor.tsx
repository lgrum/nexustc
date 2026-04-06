import type { PartialBlock } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useEffectEvent } from "react";

const EMPTY_BLOCK_NOTE_DOCUMENT: PartialBlock[] = [
  {
    type: "paragraph",
  },
];

function parseBlockNoteValue(
  value: string,
  editor: ReturnType<typeof useCreateBlockNote>
): PartialBlock[] {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return EMPTY_BLOCK_NOTE_DOCUMENT;
  }

  try {
    const parsedValue = JSON.parse(trimmedValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue as PartialBlock[];
    }
  } catch {
    return editor.tryParseMarkdownToBlocks(trimmedValue);
  }

  return editor.tryParseMarkdownToBlocks(trimmedValue);
}

function serializeBlockNoteValue(
  editor: ReturnType<typeof useCreateBlockNote>
): string {
  const blocks = editor.document;
  const markdownValue = editor.blocksToMarkdownLossy(blocks).trim();

  if (!markdownValue) {
    return "";
  }

  return JSON.stringify(blocks);
}

export function BlockNoteEditor({
  onChange,
  value = "",
  ...props
}: Omit<React.ComponentProps<typeof BlockNoteView>, "editor" | "onChange"> & {
  onChange?: (value: string) => void;
  value?: string;
}) {
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

  return (
    <BlockNoteView editor={editor} onChange={handleEditorChange} {...props} />
  );
}
