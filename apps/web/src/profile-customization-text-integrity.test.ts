import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const mojibakeSequences = [
  String.fromCodePoint(0x00_c3),
  String.fromCodePoint(0x00_c2),
  String.fromCodePoint(0x00_e2),
  String.fromCodePoint(0x00_f0),
  String.fromCodePoint(0xff_fd),
];
const sourceRoots = [
  resolve(process.cwd(), "src"),
  resolve(process.cwd(), "../../packages/api/src"),
  resolve(process.cwd(), "../../packages/auth/src"),
  resolve(process.cwd(), "../../packages/db/src"),
  resolve(process.cwd(), "../../packages/shared/src"),
  resolve(process.cwd(), "../../docs"),
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
  return files.flat().filter((file) => /\.(?:md|sql|ts|tsx)$/.test(file));
}

it("keeps application text free of common mojibake", async () => {
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
}, 15_000);
