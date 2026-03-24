const EMOJI_REGEX = /:(\w[\w-]*):/g;
const STICKER_REGEX = /\[sticker:(\w[\w-]*)\]/g;
const MAX_STICKERS_PER_COMMENT = 1;

export type TokenType = "emoji" | "sticker";

export type Token = {
  type: TokenType;
  name: string;
  raw: string;
};

export type ContentSegment =
  | { type: "text"; content: string }
  | { type: "emoji"; name: string }
  | { type: "sticker"; name: string };

export function parseTokens(content: string): Token[] {
  const tokens: Token[] = [];

  for (const match of content.matchAll(EMOJI_REGEX)) {
    tokens.push({ name: match[1]!, raw: match[0], type: "emoji" });
  }

  for (const match of content.matchAll(STICKER_REGEX)) {
    tokens.push({ name: match[1]!, raw: match[0], type: "sticker" });
  }

  return tokens;
}

export function validateTokenLimit(tokens: Token[]): {
  valid: boolean;
  error?: string;
} {
  const stickerCount = tokens.filter((t) => t.type === "sticker").length;
  if (stickerCount > MAX_STICKERS_PER_COMMENT) {
    return {
      error: `Solo un sticker por comentario (encontrados: ${stickerCount})`,
      valid: false,
    };
  }
  return { valid: true };
}

export function renderTokenizedContent(content: string): ContentSegment[] {
  const combined = new RegExp(
    `${EMOJI_REGEX.source}|${STICKER_REGEX.source}`,
    "g"
  );
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(combined)) {
    const matchIndex = match.index!;

    if (matchIndex > lastIndex) {
      segments.push({
        content: content.slice(lastIndex, matchIndex),
        type: "text",
      });
    }

    if (match[0].startsWith(":")) {
      segments.push({ name: match[1]!, type: "emoji" });
    } else {
      segments.push({ name: match[2]!, type: "sticker" });
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ content: content.slice(lastIndex), type: "text" });
  }

  return segments;
}
