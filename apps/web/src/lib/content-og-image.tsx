import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ImageResponse renders native image elements.
// oxlint-disable next/no-img-element
import { ImageResponse } from "next/og";
import sharp from "sharp";

export const contentOpenGraphImageSize = {
  height: 630,
  width: 1200,
} as const;

type ContentOpenGraphImageInput = {
  coverImageUrl?: string;
  type: "comic" | "post";
};

async function readFont(fileName: string): Promise<ArrayBuffer> {
  return Uint8Array.from(
    await readFile(join(process.cwd(), "public", "fonts", fileName))
  ).buffer;
}

const lexendFont = readFont("lexend.ttf");
const outfitFont = readFont("outfit.ttf");

async function getCoverImageSource(coverImageUrl?: string) {
  if (!coverImageUrl) {
    return;
  }

  const response = await fetch(coverImageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch cover image: ${response.status}`);
  }

  const image = await sharp(await response.arrayBuffer())
    .toColourspace("srgb")
    .resize(contentOpenGraphImageSize.width, contentOpenGraphImageSize.height)
    .png()
    .toBuffer();

  return `data:image/png;base64,${image.toString("base64")}`;
}

export async function renderContentOpenGraphImage({
  coverImageUrl,
  type,
}: ContentOpenGraphImageInput) {
  const [coverImageSource, lexend, outfit] = await Promise.all([
    getCoverImageSource(coverImageUrl),
    lexendFont,
    outfitFont,
  ]);

  return new ImageResponse(
    <div
      style={{
        backgroundImage:
          "linear-gradient(135deg, #160b36 0%, #32145f 55%, #7a4c00 100%)",
        color: "white",
        display: "flex",
        fontFamily: "Outfit",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      {coverImageSource ? (
        <img
          alt=""
          height={contentOpenGraphImageSize.height}
          src={coverImageSource}
          style={{
            filter: "brightness(0.82)",
            height: "100%",
            objectFit: "cover",
            position: "absolute",
            width: "100%",
          }}
          width={contentOpenGraphImageSize.width}
        />
      ) : (
        <div
          style={{
            background: "rgba(245, 179, 0, 0.14)",
            borderRadius: 999,
            display: "flex",
            height: 520,
            position: "absolute",
            right: -120,
            top: -190,
            width: 520,
          }}
        />
      )}

      <div
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.2) 38%, rgba(0, 0, 0, 0.72) 72%, rgba(0, 0, 0, 1) 100%)",
          display: "flex",
          height: "100%",
          left: 0,
          position: "absolute",
          top: 0,
          width: "100%",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          height: "100%",
          justifyContent: "space-between",
          padding: "58px 68px 52px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "rgba(245, 179, 0, 0.18)",
            border: "2px solid rgba(245, 179, 0, 0.72)",
            borderRadius: 999,
            color: "#ffd24a",
            display: "flex",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.16em",
            padding: "10px 18px",
          }}
        >
          {type === "comic" ? "C\u00D3MIC" : "JUEGO"}
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontFamily: "Lexend",
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: "-0.04em",
          }}
        >
          <span>NeXus</span>
          <span style={{ color: "#f5b300" }}>TC</span>
        </div>
      </div>
    </div>,
    {
      ...contentOpenGraphImageSize,
      fonts: [
        {
          data: outfit,
          name: "Outfit",
          style: "normal",
          weight: 700,
        },
        {
          data: lexend,
          name: "Lexend",
          style: "normal",
          weight: 700,
        },
      ],
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
