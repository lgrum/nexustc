import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

const count = Number(Bun.argv[2] ?? 10);
if (!(Number.isInteger(count) && count > 0 && count <= 1000)) {
  throw new Error("Page count must be an integer between 1 and 1000");
}

const outputDirectory =
  Bun.argv[3] ?? join(tmpdir(), `nexustc-comic-pages-${count}`);
const pageNumberWidth = String(count).length;
let nextPage = 1;

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  Array.from({ length: Math.min(8, count) }, async () => {
    while (nextPage <= count) {
      const pageNumber = nextPage;
      nextPage += 1;
      const label = String(pageNumber).padStart(pageNumberWidth, "0");
      const hue = (pageNumber * 47) % 360;
      const svg = `
        <svg width="320" height="450" xmlns="http://www.w3.org/2000/svg">
          <rect width="320" height="450" fill="hsl(${hue}, 65%, 35%)" />
          <text x="160" y="225" fill="white" font-family="sans-serif" font-size="52" text-anchor="middle">Page ${label}</text>
        </svg>
      `;

      await sharp(Buffer.from(svg))
        .png()
        .toFile(join(outputDirectory, `page-${label}.png`));
    }
  })
);

process.stdout.write(`${outputDirectory}\n`);
