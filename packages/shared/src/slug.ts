const COMBINING_MARKS_PATTERN = /[\u0300-\u036F]/g;
const NON_SLUG_CHARACTER_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASH_PATTERN = /^-+|-+$/g;

export function createContentSlug(title: string) {
  const slug = title
    .normalize("NFKD")
    .replaceAll(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .replaceAll(NON_SLUG_CHARACTER_PATTERN, "-")
    .replaceAll(EDGE_DASH_PATTERN, "");

  return slug || "contenido";
}

export function dedupeContentSlug(slug: string, existingSlugs: string[]) {
  const usedSlugs = new Set(existingSlugs);

  if (!usedSlugs.has(slug)) {
    return slug;
  }

  let suffix = 2;
  let candidate = `${slug}-${suffix}`;

  while (usedSlugs.has(candidate)) {
    suffix += 1;
    candidate = `${slug}-${suffix}`;
  }

  return candidate;
}
