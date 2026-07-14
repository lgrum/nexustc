import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

type MigrationJournal = {
  entries: { tag: string }[];
};

const migrationsDirectory = import.meta.dirname;

test("every migration journal tag has exactly one SQL file", async () => {
  const journal = JSON.parse(
    await readFile(
      path.join(migrationsDirectory, "meta", "_journal.json"),
      "utf-8"
    )
  ) as MigrationJournal;
  const journalFiles = journal.entries
    .map(({ tag }) => `${tag}.sql`)
    .toSorted();
  const directoryEntries = await readdir(migrationsDirectory, {
    withFileTypes: true,
  });
  const sqlFiles = directoryEntries
    .filter((entry) => entry.isFile() && path.extname(entry.name) === ".sql")
    .map((entry) => entry.name)
    .toSorted();

  expect(sqlFiles).toEqual(journalFiles);
});
