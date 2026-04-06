import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";

export const EMPTY_BLOCK_NOTE_DOCUMENT: PartialBlock[] = [
  {
    type: "paragraph",
  },
];

type BlockNoteParser = Pick<BlockNoteEditor, "tryParseMarkdownToBlocks">;
type BlockNoteSerializer = Pick<
  BlockNoteEditor,
  "blocksToMarkdownLossy" | "document"
>;

export function parseBlockNoteValue(
  value: string,
  editor: BlockNoteParser
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

export function serializeBlockNoteValue(editor: BlockNoteSerializer): string {
  const blocks = editor.document;
  const markdownValue = editor.blocksToMarkdownLossy(blocks).trim();

  if (!markdownValue) {
    return "";
  }

  return JSON.stringify(blocks);
}
