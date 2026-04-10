export type ParsedTemplate = {
  content: string;
  creatorName: string;
  creatorUrl: string;
  premiumLinks: string;
  tags: string[];
};

const markdownLinkUrlRegex = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/i;
const outerFenceRegex = /^```[^\n]*\n([\s\S]*?)\n```$/;
const separatorOnlyLineRegex = /^[^\S\n]*([^A-Za-z0-9\s])\1{4,}[^\S\n]*$/;
const separatorEdgesRegex =
  /^[^\S\n]*([^A-Za-z0-9\s])\1{4,}\s*|\s*([^A-Za-z0-9\s])\2{4,}[^\S\r\n]*$/g;
const urlRegex = /https?:\/\/\S+/i;

const creatorHeadingRegex = /^\s*\*\*CREADOR:\s*(.+?)\*\*\s*$/im;
const linksHeadingRegex = /^\s*\*\*Los LINKS Son Los.*$/im;
const supportHeadingRegex =
  /^\s*-\s*\*\*(?:Soluci(?:o|\u00F3)n de Problemas|Pide Ayuda En):\s*\*\*/im;
const synopsisHeadingRegex =
  /^\s*\*\*SINOPSIS\s*\/\s*RESUMEN\s*\/\s*LORE:\s*\*\*\s*$/im;
const tagsHeadingRegex = /^\s*\*\*.*TAGS:\s*\*\*\s*$/im;
const followHeadingRegex = /^\s*\*\*S(?:i|\u00ED)guenos en:\*\*\s*$/im;

function execWithIndex(text: string, pattern: RegExp) {
  return new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(text);
}

function normalizeTemplate(md: string): string {
  const normalized = md
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll("\u00A0", " ")
    .replaceAll("\u200B", "")
    .trim();
  const fencedMatch = normalized.match(outerFenceRegex);

  return fencedMatch ? fencedMatch[1].trim() : normalized;
}

function extractSection(
  text: string,
  startPattern: RegExp,
  endPatterns: RegExp[]
): string {
  const startMatch = execWithIndex(text, startPattern);
  if (!startMatch || startMatch.index === undefined) {
    return "";
  }

  const remainder = text.slice(startMatch.index + startMatch[0].length);
  let endIndex = remainder.length;

  for (const endPattern of endPatterns) {
    const endMatch = execWithIndex(remainder, endPattern);
    if (endMatch?.index !== undefined) {
      endIndex = Math.min(endIndex, endMatch.index);
    }
  }

  return remainder.slice(0, endIndex).trim();
}

function trimEmptyLines(lines: string[]): string[] {
  const trimmedLines = [...lines];

  while (trimmedLines[0]?.trim() === "") {
    trimmedLines.shift();
  }

  while (trimmedLines.at(-1)?.trim() === "") {
    trimmedLines.pop();
  }

  return trimmedLines;
}

function cleanDecoratedBlock(section: string): string {
  const lines = trimEmptyLines(
    section.split("\n").map((line) => {
      const trimmedLine = line.trim();
      if (separatorOnlyLineRegex.test(trimmedLine)) {
        return "";
      }

      return trimmedLine.replace(separatorEdgesRegex, "").trim();
    })
  );

  return lines
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function extractFirstUrl(text: string): string {
  const markdownLinkMatch = text.match(markdownLinkUrlRegex);
  if (markdownLinkMatch?.[1]) {
    return markdownLinkMatch[1].trim();
  }

  const urlMatch = text.match(urlRegex);
  return urlMatch?.[0]?.trim() ?? "";
}

function parseTags(section: string): string[] {
  const normalizedTags = section
    .replaceAll("```", " ")
    .replaceAll("`", " ")
    .replaceAll(/\s+/g, " ")
    .trim();

  return normalizedTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseTemplate(md: string): ParsedTemplate {
  const normalizedTemplate = normalizeTemplate(md);
  const creatorMatch = normalizedTemplate.match(creatorHeadingRegex);
  const creatorSection = extractSection(
    normalizedTemplate,
    creatorHeadingRegex,
    [tagsHeadingRegex, linksHeadingRegex, synopsisHeadingRegex]
  );
  const tagsSection = extractSection(normalizedTemplate, tagsHeadingRegex, [
    linksHeadingRegex,
    synopsisHeadingRegex,
  ]);
  const linksSection = extractSection(normalizedTemplate, linksHeadingRegex, [
    synopsisHeadingRegex,
  ]);
  const contentSection = extractSection(
    normalizedTemplate,
    synopsisHeadingRegex,
    [supportHeadingRegex, followHeadingRegex]
  );

  return {
    content: cleanDecoratedBlock(contentSection),
    creatorName: creatorMatch?.[1]?.trim() ?? "",
    creatorUrl: extractFirstUrl(creatorSection),
    premiumLinks: cleanDecoratedBlock(linksSection),
    tags: parseTags(tagsSection),
  };
}
