import type { Metadata } from "next";

export const siteUrl = "https://nexustc18.com";
export const metadataBaseUrl =
  process.env.NODE_ENV === "development" ? "http://localhost:3000" : siteUrl;
export const siteName = "NeXusTC";
export const siteDescription =
  "Comunidad, juegos, comics y contenido premium de NeXusTC.";
export const defaultOpenGraphImage = "/og-image.png";

type PageMetadataInput = {
  description?: string;
  image?: string;
  path?: string;
  title?: string;
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
