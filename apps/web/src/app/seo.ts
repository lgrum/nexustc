import type { Metadata } from "next";

export const siteUrl = "https://nexustc18.com";
export const metadataBaseUrl =
  process.env.NODE_ENV === "development" ? "http://localhost:3000" : siteUrl;
export const siteName = "NeXusTC";
export const siteDescription =
  "Comunidad, juegos, comics y contenido premium de NeXusTC.";
export const defaultOpenGraphImage = "/og-image.png";
const contentOpenGraphImageSize = { height: 630, width: 1200 } as const;

type PageMetadataInput = {
  description?: string;
  image?: string;
  path?: string;
  title?: string;
};

type ContentMetadataInput = {
  canonicalPath: string;
  contentTitle: string;
  identifier: string;
  pageTitle: string;
  type: "comic" | "post";
  updatedAt: Date;
};

export function createPageMetadata({
  description = siteDescription,
  image = defaultOpenGraphImage,
  path = "/",
  title,
}: PageMetadataInput = {}): Metadata {
  const pageTitle = title ? `${title} | ${siteName}` : siteName;
  const url = new URL(path, metadataBaseUrl).toString();

  return {
    alternates: { canonical: url },
    description,
    openGraph: {
      description,
      images: image ? [{ url: image }] : undefined,
      siteName,
      title: pageTitle,
      type: "website",
      url,
    },
    title: pageTitle,
    twitter: {
      card: image ? "summary_large_image" : "summary",
      description,
      images: image ? [image] : undefined,
      title: pageTitle,
    },
  };
}

export function createContentMetadata({
  canonicalPath,
  contentTitle,
  identifier,
  pageTitle,
  type,
  updatedAt,
}: ContentMetadataInput): Metadata {
  const canonicalUrl = new URL(canonicalPath, metadataBaseUrl).toString();
  const imageUrl = new URL(
    `/og/${type}/${encodeURIComponent(identifier)}`,
    metadataBaseUrl
  );
  imageUrl.searchParams.set("v", String(updatedAt.getTime()));

  const image = {
    alt: `${type === "comic" ? "C\u00F3mic" : "Post"}: ${contentTitle}`,
    ...contentOpenGraphImageSize,
    type: "image/png",
    url: imageUrl.toString(),
  };

  return {
    alternates: { canonical: canonicalUrl },
    description: siteDescription,
    openGraph: {
      description: siteDescription,
      images: [image],
      siteName,
      title: pageTitle,
      type: "article",
      url: canonicalUrl,
    },
    title: pageTitle,
    twitter: {
      card: "summary_large_image",
      description: siteDescription,
      images: [image],
      title: pageTitle,
    },
  };
}
