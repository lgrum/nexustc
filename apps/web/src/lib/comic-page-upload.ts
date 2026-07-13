import {
  COMIC_UPLOAD_BATCH_SIZE,
  COMIC_UPLOAD_CONCURRENCY,
  COMIC_UPLOAD_MAX_BYTES,
} from "@repo/shared/media";

export { COMIC_UPLOAD_BATCH_SIZE, COMIC_UPLOAD_CONCURRENCY };

type UploadItem = {
  file: File;
  objectKey?: string;
  selectionId: string;
};

export type ComicUploadState = UploadItem & {
  status: "failed" | "pending" | "uploaded";
};

type UploadDependencies = {
  convert: (file: File) => Promise<File>;
  createUploadUrls: (
    files: File[]
  ) => Promise<{ objectKey: string; presignedUrl: string }[]>;
  onChange?: (states: ComicUploadState[]) => void;
  onProgress?: (completed: number, total: number) => void;
  upload: (file: File, presignedUrl: string) => Promise<void>;
};

const fileNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function sortComicFiles(files: File[]) {
  return files.toSorted((left, right) =>
    fileNameCollator.compare(left.name, right.name)
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>
) {
  const results = Array.from({ length: items.length }) as R[];
  let nextIndex = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(COMIC_UPLOAD_CONCURRENCY, items.length) },
      async () => {
        while (nextIndex < items.length) {
          const index = nextIndex;
          nextIndex += 1;
          const item = items[index];
          if (item !== undefined) {
            results[index] = await mapper(item);
          }
        }
      }
    )
  );

  return results;
}

export async function uploadComicPages(
  items: UploadItem[],
  dependencies: UploadDependencies
) {
  let states: ComicUploadState[] = items.map((item) => ({
    ...item,
    status: item.objectKey ? "uploaded" : "pending",
  }));
  let completed = 0;

  const updateState = (
    selectionId: string,
    update: Partial<ComicUploadState>
  ) => {
    states = states.map((state) =>
      state.selectionId === selectionId
        ? ({ ...state, ...update } as ComicUploadState)
        : state
    );
    dependencies.onChange?.(states);
  };
  const complete = () => {
    completed += 1;
    dependencies.onProgress?.(completed, items.length);
  };

  dependencies.onProgress?.(0, items.length);

  const batches = Array.from(
    { length: Math.ceil(states.length / COMIC_UPLOAD_BATCH_SIZE) },
    (_, index) =>
      states.slice(
        index * COMIC_UPLOAD_BATCH_SIZE,
        (index + 1) * COMIC_UPLOAD_BATCH_SIZE
      )
  );

  for (const batch of batches) {
    for (const item of batch) {
      if (item.status === "uploaded") {
        complete();
      }
    }

    const pending = batch.filter((item) => item.status === "pending");
    const converted = await mapWithConcurrency(pending, async (item) => {
      try {
        const file = await dependencies.convert(item.file);
        if (file.size > COMIC_UPLOAD_MAX_BYTES) {
          throw new Error("Converted comic page is too large");
        }
        return { file, item };
      } catch {
        updateState(item.selectionId, { status: "failed" });
        complete();
        return null;
      }
    });
    const ready = converted.filter(
      (item): item is NonNullable<typeof item> => item !== null
    );

    try {
      const urls =
        ready.length > 0
          ? await dependencies.createUploadUrls(ready.map(({ file }) => file))
          : [];
      await mapWithConcurrency(
        ready.map(({ file, item }, index) => ({
          file,
          item,
          upload: urls[index],
        })),
        async ({ file, item, upload }) => {
          if (!upload) {
            updateState(item.selectionId, { status: "failed" });
            complete();
            return;
          }

          try {
            await dependencies.upload(file, upload.presignedUrl);
            updateState(item.selectionId, {
              objectKey: upload.objectKey,
              status: "uploaded",
            });
            complete();
          } catch {
            updateState(item.selectionId, { status: "failed" });
            complete();
          }
        }
      );
    } catch (error) {
      return { error, states };
    }
  }

  return { error: null, states };
}
