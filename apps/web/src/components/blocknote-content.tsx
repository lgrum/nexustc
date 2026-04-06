import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect } from "react";

import "@blocknote/shadcn/style.css";
import {
  EMPTY_BLOCK_NOTE_DOCUMENT,
  parseBlockNoteValue,
  serializeBlockNoteValue,
} from "@/lib/blocknote";

export function BlockNoteContent({ value }: { value: string }) {
  const editor = useCreateBlockNote({
    dictionary: es,
    initialContent: EMPTY_BLOCK_NOTE_DOCUMENT,
  });

  useEffect(() => {
    const currentValue = serializeBlockNoteValue(editor);

    if (currentValue === value) {
      return;
    }

    editor.replaceBlocks(editor.document, parseBlockNoteValue(value, editor));
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/70 p-2 md:p-4">
      <BlockNoteView editor={editor} editable={false} />
    </div>
  );
}
