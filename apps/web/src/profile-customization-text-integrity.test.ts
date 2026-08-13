import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const mojibakeSequences = ["Ã", "Â", "â€¦", "â€”", "�"];
const sourceRoots = [
  resolve(process.cwd(), "src/app/(main)/profile/customize"),
  resolve(process.cwd(), "src/app/(main)/user/[id]"),
  resolve(process.cwd(), "src/app/admin/profile"),
  resolve(process.cwd(), "src/components/profile"),
  resolve(
    process.cwd(),
    "../../packages/api/src/routers/profile-catalog-admin.ts"
  ),
  resolve(
    process.cwd(),
    "../../packages/api/src/services/profile-catalog-lifecycle.ts"
  ),
  resolve(
    process.cwd(),
    "../../packages/api/src/services/profile-catalog-purchase.ts"
  ),
  resolve(
    process.cwd(),
    "../../packages/api/src/services/profile-customization.ts"
  ),
  resolve(
    process.cwd(),
    "../../packages/api/src/services/profile-decoration-catalog.ts"
  ),
  resolve(
    process.cwd(),
    "../../packages/api/src/services/profile-skin-catalog.ts"
  ),
  resolve(process.cwd(), "../../packages/shared/src/profile-customization.ts"),
];

async function collectSourceFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) {
    return [path];
  }
  const files = await Promise.all(
    entries.map((entry) => {
      const child = resolve(path, entry.name);
      return entry.isDirectory() ? collectSourceFiles(child) : [child];
    })
  );
  return files.flat().filter((file) => /\.(?:ts|tsx)$/.test(file));
}

it("keeps profile customization source text free of common mojibake", async () => {
  const fileGroups = await Promise.all(sourceRoots.map(collectSourceFiles));
  const files = fileGroups.flat();
  const failures: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf-8");
    for (const sequence of mojibakeSequences) {
      if (source.includes(sequence)) {
        failures.push(`${file}: ${sequence}`);
      }
    }
  }
  expect(failures).toEqual([]);
});
