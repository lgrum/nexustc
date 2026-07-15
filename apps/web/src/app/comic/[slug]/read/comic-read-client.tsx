"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ComicCascadeReader, ComicReader } from "@/components/posts/comic-page";
import { PostProvider } from "@/components/posts/post-context";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import type { PostType } from "@/lib/types";

type ReaderMode = "fullscreen" | "cascade";

const READER_MODE_STORAGE_KEY = "nexustc:comic-reader-mode";
const NANOID_PATTERN = /^[0-9A-Za-z]{21}$/;

function getStoredReaderMode(): ReaderMode {
  try {
    const mode = window.localStorage.getItem(READER_MODE_STORAGE_KEY);
    return mode === "cascade" || mode === "fullscreen" ? mode : "fullscreen";
  } catch {
    return "fullscreen";
  }
}

function storeReaderMode(mode: ReaderMode) {
  try {
    window.localStorage.setItem(READER_MODE_STORAGE_KEY, mode);
  } catch {
    // Reader mode preference is nice-to-have; private storage should not break reading.
  }
}

function getComicQueryInput(idOrSlug: string) {
  return NANOID_PATTERN.test(idOrSlug)
    ? idOrSlug
    : { slug: idOrSlug, type: "comic" as const };
}

export function ComicReadClient({
  comic,
  initialMode,
  initialPage,
  slug,
}: {
  comic: PostType;
  initialMode: ReaderMode | undefined;
  initialPage: number;
  slug: string;
}) {
  const router = useRouter();
  const { data: currentComic } = useQuery({
    ...orpc.post.getPostById.queryOptions({
      input: getComicQueryInput(slug),
    }),
    initialData: comic,
    refetchOnWindowFocus: true,
  });
  const { data: auth } = authClient.useSession();
  const images = currentComic.imageObjectKeys ?? [];
  const selectedPage = Math.min(initialPage, Math.max(images.length - 1, 0));
  const progressQueryKey = orpc.comicProgress.getByComicId.queryOptions({
    input: { comicId: currentComic.id },
  }).queryKey;
  const isAuthed = Boolean(auth?.session);
  const activeMode = initialMode ?? getStoredReaderMode();

  useEffect(() => {
    if (!initialMode) {
      const storedMode = getStoredReaderMode();
      router.replace(
        `/comic/${slug}/read?mode=${storedMode}&page=${selectedPage}`,
        { scroll: false }
      );
      return;
    }

    storeReaderMode(initialMode);
  }, [initialMode, router, selectedPage, slug]);

  const navigateToInfo = () => {
    router.push(`/comic/${slug}`);
  };

  const setPage = (nextPage: number) => {
    if (nextPage < 0) {
      navigateToInfo();
      return;
    }

    router.push(`/comic/${slug}/read?mode=fullscreen&page=${nextPage}`, {
      scroll: false,
    });
  };

  return (
    <PostProvider post={currentComic}>
      {activeMode === "cascade" ? (
        <ComicCascadeReader
          comic={currentComic}
          images={images}
          isAuthed={isAuthed}
          onChangeMode={(nextPage) => {
            storeReaderMode("fullscreen");
            router.push(
              `/comic/${slug}/read?mode=fullscreen&page=${nextPage}`,
              {
                scroll: false,
              }
            );
          }}
          onExit={navigateToInfo}
          page={selectedPage}
          progressQueryKey={progressQueryKey}
        />
      ) : (
        <ComicReader
          comic={currentComic}
          images={images}
          isAuthed={isAuthed}
          onChangeMode={() => {
            storeReaderMode("cascade");
            router.push(
              `/comic/${slug}/read?mode=cascade&page=${selectedPage}`,
              { scroll: false }
            );
          }}
          page={selectedPage}
          progressQueryKey={progressQueryKey}
          setPage={setPage}
        />
      )}
    </PostProvider>
  );
}
