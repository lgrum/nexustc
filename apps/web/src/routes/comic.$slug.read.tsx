import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect } from "react";
import z from "zod";

import { ComicCascadeReader, ComicReader } from "@/components/posts/comic-page";
import { PostProvider } from "@/components/posts/post-context";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

type ReaderMode = "fullscreen" | "cascade";

const READER_MODE_STORAGE_KEY = "nexustc:comic-reader-mode";

const readerSearchSchema = z.object({
  mode: z.enum(["fullscreen", "cascade"]).optional(),
  page: z.coerce.number().int().min(0).optional().default(0),
});

function getStoredReaderMode(): ReaderMode {
  if (typeof window === "undefined") {
    return "fullscreen";
  }

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

function getComicQueryOptions(slug: string) {
  return orpc.post.getPostById.queryOptions({
    input: { slug, type: "comic" },
  });
}

function getErrorCode(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

export const Route = createFileRoute("/comic/$slug/read")({
  component: RouteComponent,
  staleTime: 1000 * 60 * 5,
  loader: async ({ params }) => {
    try {
      const data = await queryClient.ensureQueryData(
        getComicQueryOptions(params.slug)
      );

      if (data.type !== "comic") {
        throw notFound();
      }

      return data;
    } catch (error) {
      const code = getErrorCode(error);

      if (code === "NOT_FOUND") {
        throw notFound();
      }

      if (code === "RATE_LIMITED") {
        throw new Error("RATE_LIMITED", { cause: error });
      }

      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        media: getCoverImageObjectKey(
          loaderData?.imageObjectKeys,
          loaderData?.coverImageObjectKey
        )
          ? getBucketUrl(
              getCoverImageObjectKey(
                loaderData?.imageObjectKeys,
                loaderData?.coverImageObjectKey
              )!
            )
          : undefined,
        title: loaderData?.earlyAccess.isRestrictedView
          ? "NeXusTC - VIP Early Access"
          : `NeXusTC - Leer ${loaderData ? loaderData.title : "comic"}`,
      },
    ],
  }),
  validateSearch: zodValidator(readerSearchSchema),
});

function RouteComponent() {
  const { slug } = Route.useParams();
  const { mode, page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: comic } = useSuspenseQuery({
    ...getComicQueryOptions(slug),
    refetchOnWindowFocus: true,
  });
  const { data: auth } = authClient.useSession();
  const images = comic.imageObjectKeys ?? [];
  const selectedPage = Math.min(page, Math.max(images.length - 1, 0));
  const progressQueryKey = orpc.comicProgress.getByComicId.queryOptions({
    input: { comicId: comic.id },
  }).queryKey;
  const isAuthed = Boolean(auth?.session);
  const activeMode = mode ?? getStoredReaderMode();

  useEffect(() => {
    if (!mode) {
      navigate({
        params: { slug },
        replace: true,
        search: { mode: getStoredReaderMode(), page: selectedPage },
        to: "/comic/$slug/read",
      });
      return;
    }

    storeReaderMode(mode);
  }, [mode, navigate, selectedPage, slug]);

  const navigateToInfo = () => {
    navigate({
      params: { slug },
      to: "/comic/$slug",
    });
  };

  const setPage = (nextPage: number) => {
    if (nextPage < 0) {
      navigateToInfo();
      return;
    }

    navigate({
      params: { slug },
      search: { mode: "fullscreen", page: nextPage },
      to: "/comic/$slug/read",
    });
  };

  return (
    <PostProvider post={comic}>
      {activeMode === "cascade" ? (
        <ComicCascadeReader
          comic={comic}
          images={images}
          isAuthed={isAuthed}
          onChangeMode={(nextPage) => {
            storeReaderMode("fullscreen");
            navigate({
              params: { slug },
              search: { mode: "fullscreen", page: nextPage },
              to: "/comic/$slug/read",
            });
          }}
          onExit={navigateToInfo}
          progressQueryKey={progressQueryKey}
        />
      ) : (
        <ComicReader
          comic={comic}
          images={images}
          isAuthed={isAuthed}
          onChangeMode={() => {
            storeReaderMode("cascade");
            navigate({
              params: { slug },
              search: { mode: "cascade", page: selectedPage },
              to: "/comic/$slug/read",
            });
          }}
          page={selectedPage}
          progressQueryKey={progressQueryKey}
          setPage={setPage}
        />
      )}
    </PostProvider>
  );
}
