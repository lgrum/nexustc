import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowRightDoubleIcon,
  Book02Icon,
  Calendar03Icon,
  Cancel01Icon,
  FullScreenIcon,
  GridViewIcon,
  Home01Icon,
  MinimizeScreenIcon,
  StarIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Navigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient, queryClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import type { EngagementPromptType, PostType } from "@/lib/types";
import { cn, getBucketUrl } from "@/lib/utils";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { CommentSection } from "./comment-section";
import { EngagementPromptBlock } from "./engagement-prompt-block";
import {
  CreatorSupportCard,
  DiscordSection,
  PostChangelog,
  PostContent,
  PostInfo,
  PostSidebarContent,
  PostStatsBar,
  PostTagsSection,
  RelatedGamesSection,
  TutorialsSection,
} from "./post-components";
import { PostProvider, usePost } from "./post-context";

const postPageApi = getRouteApi("/_main/post/$id");

type ComicProgressData = {
  currentPageCount: number;
  lastPageRead: number;
  resumePage: number | null;
  resumePromptEnabled: boolean;
  status: "read" | "reading" | "unread" | "updated";
  vipResumeEnabled: boolean;
} | null;

function getComicProgressBadge(
  status: NonNullable<ComicProgressData>["status"] | undefined
) {
  switch (status) {
    case "read": {
      return {
        className: "border-emerald-500/30 bg-emerald-500/90 text-white",
        label: "Leido",
      };
    }
    case "reading": {
      return {
        className: "border-sky-500/30 bg-sky-500/90 text-white",
        label: "En progreso",
      };
    }
    case "updated": {
      return {
        className: "border-amber-400/40 bg-amber-400 text-amber-950",
        label: "Nuevo contenido",
      };
    }
    default: {
      return null;
    }
  }
}

export function ComicPage({ comic }: { comic: PostType }) {
  const { page } = postPageApi.useSearch();
  const navigate = postPageApi.useNavigate();
  const { data: auth } = authClient.useSession();
  const isAuthed = Boolean(auth?.session);
  const comicProgressQueryOptions =
    orpc.comicProgress.getByComicId.queryOptions({
      input: { comicId: comic.id },
    });
  const comicProgressQuery = useQuery({
    ...comicProgressQueryOptions,
    enabled: isAuthed,
  });
  const comicProgress = (comicProgressQuery.data ?? null) as ComicProgressData;

  const setPage = useMemo(
    () => (newPage: number) => {
      if (newPage < 0) {
        navigate({});
        return;
      }

      navigate({ search: () => ({ page: newPage }) });
    },
    [navigate]
  );

  if (!comic || comic.imageObjectKeys === null) {
    return <Navigate to="/" />;
  }

  // When page >= 0, show the reader
  if (page !== undefined && page >= 0) {
    return (
      <PostProvider post={comic}>
        <ComicReader
          comic={comic}
          images={comic.imageObjectKeys}
          isAuthed={isAuthed}
          page={page}
          progressQueryKey={comicProgressQueryOptions.queryKey}
          setPage={setPage}
        />
      </PostProvider>
    );
  }

  // Otherwise show the info page
  return (
    <PostProvider post={comic}>
      <ComicInfoPage comicProgress={comicProgress} setPage={setPage} />
    </PostProvider>
  );
}

/* ============================================================================
   Comic Info Page
   ============================================================================ */

function ComicInfoPage({
  comicProgress,
  setPage,
}: {
  comicProgress: ComicProgressData;
  setPage: (page: number) => void;
}) {
  const comic = usePost();
  const [selectedPrompt, setSelectedPrompt] =
    useState<EngagementPromptType | null>(null);
  const mainImage = getCoverImageObjectKey(
    comic.imageObjectKeys,
    comic.coverImageObjectKey
  );
  const allImages = comic.imageObjectKeys ?? [];
  const totalPages = allImages.length;
  const progressBadge = getComicProgressBadge(comicProgress?.status);
  const resumePage = comicProgress?.resumePage ?? null;

  return (
    <div className="relative flex gap-6 pb-4">
      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Hero */}
        <div className="relative overflow-hidden">
          {mainImage && (
            <div className="relative">
              <div className="aspect-3/4 max-h-120 w-full overflow-hidden">
                <img
                  alt={`Portada de ${comic.title}`}
                  className="h-full w-full object-cover"
                  src={getBucketUrl(mainImage)}
                />
              </div>
              <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h1 className="mb-2 font-[Lexend] font-bold text-3xl text-white drop-shadow-lg">
                  {comic.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge
                    className="border-white/30 bg-white/20 text-white backdrop-blur-sm"
                    variant="outline"
                  >
                    <HugeiconsIcon className="size-3.5" icon={Book02Icon} />
                    {totalPages} páginas
                  </Badge>
                  {progressBadge && (
                    <Badge className={progressBadge.className}>
                      {progressBadge.label}
                    </Badge>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <HugeiconsIcon className="size-3.5" icon={Calendar03Icon} />
                    {format(comic.createdAt, "d MMM yyyy", { locale: es })}
                  </span>
                  {comic.ratingCount !== undefined && comic.ratingCount > 0 && (
                    <span className="flex items-center gap-1 text-white">
                      <HugeiconsIcon
                        className="size-3.5 fill-amber-400 text-amber-400"
                        icon={StarIcon}
                      />
                      {comic.averageRating?.toFixed(1)}
                      <span className="text-white/60">
                        ({comic.ratingCount})
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <PostStatsBar />

        <div className="flex flex-col gap-4 px-4 pt-4">
          {comicProgress?.resumePromptEnabled && resumePage !== null && (
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sm md:text-base">
                    Quieres continuar donde lo dejaste?
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Retoma la lectura desde la pagina {resumePage}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setPage(resumePage - 1)}>
                    Continuar lectura
                  </Button>
                  <Button onClick={() => setPage(0)} variant="outline">
                    Empezar desde el inicio
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* CTA */}
          <Button
            className="w-full gap-2 py-6 text-lg"
            onClick={() => setPage(0)}
            size="lg"
          >
            <HugeiconsIcon className="size-5" icon={Book02Icon} />
            {comicProgress?.status === "read"
              ? "Leer de nuevo"
              : "Empezar a Leer"}
          </Button>

          <PostContent />
          <PostInfo />
          <PostTagsSection />
          <PostChangelog />

          {/* Chapters / Thumbnails */}
          <div className="flex flex-col gap-3">
            <div className="section-title">Capítulos</div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
              {allImages.map((image, index) => (
                <button
                  className="group relative aspect-3/4 overflow-hidden border border-border transition-all hover:border-primary"
                  key={image}
                  onClick={() => setPage(index)}
                  type="button"
                >
                  <img
                    alt={`Página ${index + 1}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-110"
                    loading="lazy"
                    src={getBucketUrl(image)}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2">
                    <span className="font-medium text-sm text-white">
                      {index + 1}
                    </span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/0 transition-colors group-hover:bg-primary/10">
                    <span className="rounded-full bg-black/60 px-3 py-1 font-medium text-sm text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                      Leer
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="md:hidden">
            <CreatorSupportCard />
          </div>
          <EngagementPromptBlock
            onAnswerPrompt={setSelectedPrompt}
            prompts={comic.engagementPrompts}
          />
          <CommentSection
            onSelectedPromptChange={setSelectedPrompt}
            selectedPrompt={selectedPrompt}
          />
          <TutorialsSection />
          <DiscordSection />
          <div className="md:hidden">
            <RelatedGamesSection />
          </div>
        </div>
      </div>

      {/* Sidebar — desktop only */}
      <aside className="hidden w-72 shrink-0 pt-4 pr-4 md:block">
        <div className="sticky top-22 flex flex-col gap-4">
          <PostSidebarContent />
        </div>
      </aside>
    </div>
  );
}

/* ============================================================================
   Comic Reader - Immersive Full-Screen Experience
   ============================================================================ */

function ComicReader({
  comic,
  page,
  isAuthed,
  progressQueryKey,
  setPage,
  images,
}: {
  comic: PostType;
  isAuthed: boolean;
  page: number;
  progressQueryKey: readonly unknown[];
  setPage: (page: number) => void;
  images: string[];
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [readingSessionId, setReadingSessionId] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const lastTouchDistanceRef = useRef<number | null>(null);

  const totalPages = images.length;
  const currentImage = images[page];
  const progress = ((page + 1) / totalPages) * 100;

  useEffect(() => {
    let cancelled = false;

    if (!isAuthed) {
      setReadingSessionId(null);
      return;
    }

    const createReadingSession = async () => {
      try {
        const sessionState = await orpcClient.comicProgress.startSession({
          comicId: comic.id,
        });

        if (!cancelled) {
          setReadingSessionId(sessionState.readingSessionId);
        }
      } catch {
        if (!cancelled) {
          setReadingSessionId(null);
        }
      }
    };

    createReadingSession();

    return () => {
      cancelled = true;
    };
  }, [comic.id, isAuthed]);

  useEffect(() => {
    if (!(isAuthed && readingSessionId && totalPages > 0)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const syncProgress = async () => {
        try {
          await orpcClient.comicProgress.update({
            comicId: comic.id,
            page: page + 1,
            readingSessionId,
          });
        } catch {
          // Best-effort sync; reader UX should not break on transient failures.
        }
      };

      syncProgress();
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [comic.id, isAuthed, page, readingSessionId, totalPages]);

  // Check if image is already cached/loaded on mount
  useEffect(() => {
    if (imageRef.current?.complete) {
      setIsImageLoading(false);
    }
  }, []);

  const canGoPrev = page > 0;
  const canGoNext = page < totalPages - 1;

  // Zoom functions (defined first since navigation depends on them)
  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Navigation functions
  const goToPrevious = useCallback(() => {
    if (canGoPrev) {
      setIsImageLoading(true);
      resetZoom();
      setPage(page - 1);
    }
  }, [canGoPrev, page, setPage, resetZoom]);

  const goToNext = useCallback(() => {
    if (canGoNext) {
      setIsImageLoading(true);
      resetZoom();
      setPage(page + 1);
    }
  }, [canGoNext, page, setPage, resetZoom]);

  const goToFirst = useCallback(() => {
    setIsImageLoading(true);
    resetZoom();
    setPage(0);
  }, [setPage, resetZoom]);

  const goToLast = useCallback(() => {
    setIsImageLoading(true);
    resetZoom();
    setPage(totalPages - 1);
  }, [setPage, totalPages, resetZoom]);

  const goToInfo = useCallback(() => {
    const invalidateProgress = async () => {
      try {
        await queryClient.invalidateQueries({
          queryKey: progressQueryKey,
        });
      } catch {
        // Let navigation continue even if the cache refresh fails.
      }
    };

    invalidateProgress();
    setPage(-1);
  }, [progressQueryKey, setPage]);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const newScale = Math.max(prev - 0.5, 1);
      if (newScale === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newScale;
    });
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    }
  }, []);

  // Auto-hide controls
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showThumbnails) {
        setShowControls(false);
      }
    }, 3000);
  }, [showThumbnails]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft": {
          e.preventDefault();
          goToPrevious();
          showControlsTemporarily();
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          goToNext();
          showControlsTemporarily();
          break;
        }
        case "Home": {
          e.preventDefault();
          goToFirst();
          showControlsTemporarily();
          break;
        }
        case "End": {
          e.preventDefault();
          goToLast();
          showControlsTemporarily();
          break;
        }
        case "Escape": {
          if (scale > 1) {
            resetZoom();
          } else if (showThumbnails) {
            setShowThumbnails(false);
          } else {
            goToInfo();
          }
          break;
        }
        case "+":
        case "=": {
          e.preventDefault();
          zoomIn();
          break;
        }
        case "-": {
          e.preventDefault();
          zoomOut();
          break;
        }
        case "f": {
          e.preventDefault();
          toggleFullscreen();
          break;
        }
        default: {
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    goToPrevious,
    goToNext,
    goToFirst,
    goToLast,
    goToInfo,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleFullscreen,
    showControlsTemporarily,
    scale,
    showThumbnails,
  ]);

  // Mouse movement for auto-hide
  useEffect(() => {
    const handleMouseMove = () => showControlsTemporarily();
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [showControlsTemporarily]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Touch handlers for swipe and pinch-to-zoom
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        time: Date.now(),
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      if (scale > 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        };
      }
    } else if (e.touches.length === 2) {
      // Pinch to zoom
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistanceRef.current = distance;
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && lastTouchDistanceRef.current !== null) {
      // Pinch to zoom
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = distance - lastTouchDistanceRef.current;
      setScale((prev) => Math.max(1, Math.min(4, prev + delta * 0.01)));
      lastTouchDistanceRef.current = distance;
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // Pan while zoomed
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    }
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      lastTouchDistanceRef.current = null;
      setIsDragging(false);

      // Handle swipe for page navigation (only when not zoomed)
      if (touchStartRef.current && scale === 1) {
        const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
        const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
        const deltaTime = Date.now() - touchStartRef.current.time;

        // Only swipe if horizontal movement is greater than vertical
        if (Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < 300) {
          const threshold = 50;
          if (deltaX > threshold) {
            goToPrevious();
          } else if (deltaX < -threshold) {
            goToNext();
          }
        }
      }
      touchStartRef.current = null;
    }
  };

  // Mouse handlers for drag when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Double click to zoom
  const handleDoubleClick = () => {
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2);
    }
  };

  // Wheel to zoom
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setScale((prev) => {
      const newScale = Math.max(1, Math.min(4, prev + delta));
      if (newScale === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newScale;
    });
  };

  return (
    // image area needs touch/mouse events for zoom/pan
    // oxlint-disable-next-line jsx_a11y/no-static-element-interactions
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background",
        !showControls && "cursor-none"
      )}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      ref={containerRef}
    >
      {/* Top Bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-linear-to-b from-black/80 to-transparent p-4 transition-all duration-300",
          showControls
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0"
        )}
      >
        <div className="flex items-center gap-3">
          <Button
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={goToInfo}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon className="size-4" icon={Home01Icon} />
            Volver
          </Button>
          <Separator className="bg-white/20" orientation="vertical" />
          <h1 className="line-clamp-1 max-w-xs px-2 font-medium text-sm text-white md:max-w-md">
            {comic.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Page Counter */}
          <span className="rounded-full bg-white/10 px-3 py-1 font-medium text-sm text-white backdrop-blur-sm">
            {page + 1} / {totalPages}
          </span>

          {/* Thumbnail Toggle */}
          <Tooltip>
            <TooltipTrigger
              onClick={() => setShowThumbnails(!showThumbnails)}
              render={
                <Button
                  className={cn(
                    "text-white hover:bg-white/10 hover:text-white",
                    showThumbnails && "bg-white/20"
                  )}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon icon={ViewIcon} />
            </TooltipTrigger>
            <TooltipContent>Mostrar miniaturas</TooltipContent>
          </Tooltip>

          {/* Fullscreen Toggle */}
          <Tooltip>
            <TooltipTrigger
              onClick={toggleFullscreen}
              render={
                <Button
                  className="text-white hover:bg-white/10 hover:text-white"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon
                className="size-4"
                icon={isFullscreen ? MinimizeScreenIcon : FullScreenIcon}
              />
            </TooltipTrigger>
            <TooltipContent>
              {isFullscreen
                ? "Salir de pantalla completa"
                : "Pantalla completa"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        onWheel={handleWheel}
      >
        {/* Navigation Zones - Click areas for prev/next */}
        <button
          aria-label="Página anterior"
          className={cn(
            "absolute top-0 left-0 z-10 h-full cursor-pointer opacity-0 transition-opacity hover:opacity-100",
            !canGoPrev && "cursor-not-allowed"
          )}
          disabled={!canGoPrev}
          onClick={goToPrevious}
          type="button"
        >
          <div className="flex h-full items-center justify-start pl-4">
            <div className="rounded-full bg-white/10 p-3 backdrop-blur-sm">
              <HugeiconsIcon
                className="size-8 text-white"
                icon={ArrowLeft01Icon}
              />
            </div>
          </div>
        </button>

        <button
          aria-label="Página siguiente"
          className={cn(
            "absolute top-0 right-0 z-10 h-full cursor-pointer opacity-0 transition-opacity hover:opacity-100",
            !canGoNext && "cursor-not-allowed"
          )}
          disabled={!canGoNext}
          onClick={goToNext}
          type="button"
        >
          <div className="flex h-full items-center justify-end pr-4">
            <div className="rounded-full bg-white/10 p-3 backdrop-blur-sm">
              <HugeiconsIcon
                className="size-8 text-white"
                icon={ArrowRight01Icon}
              />
            </div>
          </div>
        </button>

        {/* Loading Spinner */}
        {isImageLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          </div>
        )}

        {/* Main Image */}
        {currentImage && (
          <img
            alt={`Página ${page + 1}`}
            className={cn(
              "max-h-full max-w-full select-none object-contain",
              isImageLoading ? "opacity-0" : "opacity-100",
              isDragging
                ? "cursor-grabbing"
                : scale > 1
                  ? showControls
                    ? "cursor-grab"
                    : "cursor-none"
                  : ""
            )}
            draggable={false}
            onLoad={() => setIsImageLoading(false)}
            ref={imageRef}
            src={getBucketUrl(currentImage)}
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            }}
          />
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-linear-to-t from-black/80 to-transparent p-4 transition-all duration-300",
          showControls
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0"
        )}
      >
        {/* Progress Bar */}
        <div className="mx-auto w-full max-w-3xl">
          <Progress className="h-1.5" value={progress} />
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center justify-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  className="text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
                  disabled={!canGoPrev}
                  onClick={goToFirst}
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon className="size-5" icon={ArrowLeftDoubleIcon} />
            </TooltipTrigger>
            <TooltipContent>Primera página (Home)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  className="text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
                  disabled={!canGoPrev}
                  onClick={goToPrevious}
                  size="lg"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon className="size-6" icon={ArrowLeft01Icon} />
            </TooltipTrigger>
            <TooltipContent>Página anterior (←)</TooltipContent>
          </Tooltip>

          {/* Page indicator button - opens thumbnail view */}
          <Button
            className="min-w-24 gap-2 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setShowThumbnails(!showThumbnails)}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon className="size-4" icon={GridViewIcon} />
            {page + 1} / {totalPages}
          </Button>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  className="text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
                  disabled={!canGoNext}
                  onClick={goToNext}
                  size="lg"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon className="size-6" icon={ArrowRight01Icon} />
            </TooltipTrigger>
            <TooltipContent>Página siguiente (→)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  className="text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
                  disabled={!canGoNext}
                  onClick={goToLast}
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon className="size-5" icon={ArrowRightDoubleIcon} />
            </TooltipTrigger>
            <TooltipContent>Última página (End)</TooltipContent>
          </Tooltip>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="hidden items-center justify-center gap-4 text-white/50 text-xs md:flex">
          <span>← → Navegar</span>
          <span>F Pantalla completa</span>
          <span>+/- Zoom</span>
          <span>ESC Salir</span>
        </div>
      </div>

      {/* Thumbnail Panel */}
      <ThumbnailPanel
        currentPage={page}
        images={images}
        onClose={() => setShowThumbnails(false)}
        onSelectPage={(p) => {
          setIsImageLoading(true);
          resetZoom();
          setPage(p);
          setShowThumbnails(false);
        }}
        open={showThumbnails}
      />
    </div>
  );
}

/* ============================================================================
   Thumbnail Panel - Slide-up panel for page selection
   ============================================================================ */

function ThumbnailPanel({
  open,
  onClose,
  images,
  currentPage,
  onSelectPage,
}: {
  open: boolean;
  onClose: () => void;
  images: string[];
  currentPage: number;
  onSelectPage: (page: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll to current page when panel opens
  useEffect(() => {
    if (open && selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }, [open]);

  return (
    <DialogPrimitive.Root onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-40 bg-black/60 backdrop-blur-sm duration-200 data-closed:animate-out data-open:animate-in" />
        <DialogPrimitive.Popup
          className="data-closed:slide-out-to-bottom data-open:slide-in-from-bottom fixed inset-x-0 bottom-0 z-50 max-h-[60vh] overflow-hidden rounded-t-3xl bg-zinc-900/95 backdrop-blur-xl duration-300 data-closed:animate-out data-open:animate-in"
          ref={panelRef}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-white/10 border-b bg-zinc-900/80 p-4 backdrop-blur-sm">
            <h3 className="font-semibold text-lg text-white">
              Todas las páginas
            </h3>
            <DialogPrimitive.Close
              render={
                <Button
                  className="text-white hover:bg-white/10 hover:text-white"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <HugeiconsIcon className="size-5" icon={Cancel01Icon} />
            </DialogPrimitive.Close>
          </div>

          {/* Thumbnail Grid */}
          <div className="overflow-y-auto p-4">
            <div className="grid grid-cols-4 gap-3 md:grid-cols-6 lg:grid-cols-8">
              {images.map((image, index) => (
                <button
                  className={cn(
                    "group relative aspect-3/4 overflow-hidden rounded-lg transition-all",
                    currentPage === index
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-zinc-900"
                      : "opacity-60 hover:opacity-100"
                  )}
                  key={image}
                  onClick={() => onSelectPage(index)}
                  ref={currentPage === index ? selectedRef : null}
                  type="button"
                >
                  <img
                    alt={`Página ${index + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={getBucketUrl(image)}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-1">
                    <span className="font-medium text-white text-xs">
                      {index + 1}
                    </span>
                  </div>
                  {currentPage === index && (
                    <div className="absolute inset-0 bg-primary/20" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
