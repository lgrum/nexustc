"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowRightDoubleIcon,
  Cancel01Icon,
  Download04Icon,
  FullScreenIcon,
  GridViewIcon,
  MinimizeScreenIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TouchEvent } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ImageViewerProps = {
  images: { src: string; alt: string }[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
};

export function ImageViewer({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
  title,
}: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const lastTouchDistanceRef = useRef<number | null>(null);

  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;
  const progress = ((currentIndex + 1) / images.length) * 100;

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < images.length - 1;

  // Reset state when gallery opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setIsImageLoading(true);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setShowControls(true);
    }
  }, [open, initialIndex]);

  // Check if image is already cached/loaded on mount
  useEffect(() => {
    if (imageRef.current?.complete) {
      setIsImageLoading(false);
    }
  }, []);

  // Zoom functions
  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

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

  // Navigation functions
  const goToPrevious = useCallback(() => {
    if (canGoPrev) {
      setIsImageLoading(true);
      resetZoom();
      setCurrentIndex((prev) => prev - 1);
    }
  }, [canGoPrev, resetZoom]);

  const goToNext = useCallback(() => {
    if (canGoNext) {
      setIsImageLoading(true);
      resetZoom();
      setCurrentIndex((prev) => prev + 1);
    }
  }, [canGoNext, resetZoom]);

  const goToFirst = useCallback(() => {
    setIsImageLoading(true);
    resetZoom();
    setCurrentIndex(0);
  }, [resetZoom]);

  const goToLast = useCallback(() => {
    setIsImageLoading(true);
    resetZoom();
    setCurrentIndex(images.length - 1);
  }, [images.length, resetZoom]);

  const handleDownload = () => {
    window.open(currentImage.src, "_blank");
  };

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
    if (!open) {
      return;
    }

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
            onOpenChange(false);
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
    open,
    goToPrevious,
    goToNext,
    goToFirst,
    goToLast,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleFullscreen,
    showControlsTemporarily,
    scale,
    showThumbnails,
    onOpenChange,
  ]);

  // Mouse movement for auto-hide
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleMouseMove = () => showControlsTemporarily();
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [open, showControlsTemporarily]);

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
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistanceRef.current = distance;
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && lastTouchDistanceRef.current !== null) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = distance - lastTouchDistanceRef.current;
      setScale((prev) => Math.max(1, Math.min(4, prev + delta * 0.01)));
      lastTouchDistanceRef.current = distance;
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
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

      if (touchStartRef.current && scale === 1) {
        const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
        const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
        const deltaTime = Date.now() - touchStartRef.current.time;

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

  if (images.length === 0) {
    return null;
  }

  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/90 duration-200 data-closed:animate-out data-open:animate-in"
          data-slot="viewer-overlay"
        />
        <DialogPrimitive.Popup
          className="data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 flex flex-col duration-200 data-closed:animate-out data-open:animate-in"
          data-slot="viewer-content"
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
              {title && (
                <h1 className="line-clamp-1 max-w-xs px-2 font-medium text-sm text-white md:max-w-md">
                  {title}
                </h1>
              )}
              <span className="rounded-full bg-white/10 px-3 py-1 font-medium text-sm text-white backdrop-blur-sm">
                {currentIndex + 1} / {images.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={handleDownload}
                size="sm"
                variant="ghost"
              >
                <HugeiconsIcon className="size-4" icon={Download04Icon} />
                Descargar
              </Button>

              {/* Thumbnail Toggle */}
              {hasMultipleImages && (
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
              )}

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
                    : "Pantalla completa (F)"}
                </TooltipContent>
              </Tooltip>

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
                <span className="sr-only">Cerrar</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Main Image Area */}
          {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events */}
          <div
            className={cn(
              "relative flex flex-1 items-center justify-center overflow-hidden",
              !showControls && "cursor-none"
            )}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onOpenChange(false);
              }
            }}
            onDoubleClick={handleDoubleClick}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseUp}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            onTouchStart={handleTouchStart}
            onWheel={handleWheel}
            role="presentation"
          >
            {/* Navigation Zones */}
            {hasMultipleImages && (
              <>
                <button
                  aria-label="Imagen anterior"
                  className={cn(
                    "absolute top-0 left-0 z-10 h-full w-1/4 cursor-pointer opacity-0 transition-opacity hover:opacity-100",
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
                  aria-label="Imagen siguiente"
                  className={cn(
                    "absolute top-0 right-0 z-10 h-full w-1/4 cursor-pointer opacity-0 transition-opacity hover:opacity-100",
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
              </>
            )}

            {/* Loading Spinner */}
            {isImageLoading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center">
                <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              </div>
            )}

            {/* Main Image */}
            {currentImage && (
              <img
                alt={currentImage.alt}
                className={cn(
                  "max-h-[calc(100vh-200px)] max-w-full select-none object-contain transition-opacity duration-300",
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
                src={currentImage.src}
                style={{
                  transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                }}
              />
            )}
          </div>

          {/* Bottom Section */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-linear-to-t from-black/80 to-transparent p-4 transition-all duration-300",
              showControls
                ? "translate-y-0 opacity-100"
                : "translate-y-full opacity-0"
            )}
          >
            {/* Progress Bar */}
            {hasMultipleImages && (
              <div className="mx-auto w-full max-w-3xl">
                <Progress className="h-1.5" value={progress} />
              </div>
            )}

            {/* Navigation Controls */}
            {hasMultipleImages && (
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
                    <HugeiconsIcon
                      className="size-5"
                      icon={ArrowLeftDoubleIcon}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Primera imagen (Home)</TooltipContent>
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
                  <TooltipContent>Imagen anterior (←)</TooltipContent>
                </Tooltip>

                {/* Page indicator button - opens thumbnail view */}
                <Button
                  className="min-w-24 gap-2 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setShowThumbnails(!showThumbnails)}
                  size="sm"
                  variant="ghost"
                >
                  <HugeiconsIcon className="size-4" icon={GridViewIcon} />
                  {currentIndex + 1} / {images.length}
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
                  <TooltipContent>Imagen siguiente (→)</TooltipContent>
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
                    <HugeiconsIcon
                      className="size-5"
                      icon={ArrowRightDoubleIcon}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Última imagen (End)</TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* Keyboard shortcuts hint */}
            <div className="hidden items-center justify-center gap-4 text-white/50 text-xs md:flex">
              <span>← → Navegar</span>
              <span>F Pantalla completa</span>
              <span>+/- Zoom</span>
              <span>Doble clic para zoom</span>
              <span>ESC Cerrar</span>
            </div>
          </div>
        </DialogPrimitive.Popup>

        {/* Thumbnail Panel */}
        {hasMultipleImages && (
          <ThumbnailPanel
            currentIndex={currentIndex}
            images={images}
            onClose={() => setShowThumbnails(false)}
            onSelectImage={(index) => {
              setIsImageLoading(true);
              resetZoom();
              setCurrentIndex(index);
              setShowThumbnails(false);
            }}
            open={showThumbnails}
          />
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ============================================================================
   Thumbnail Panel - Slide-up panel for image selection
   ============================================================================ */

function ThumbnailPanel({
  open,
  onClose,
  images,
  currentIndex,
  onSelectImage,
}: {
  open: boolean;
  onClose: () => void;
  images: { src: string; alt: string }[];
  currentIndex: number;
  onSelectImage: (index: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll to current image when panel opens
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
        <DialogPrimitive.Backdrop className="data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-60 bg-black/60 backdrop-blur-sm duration-200 data-closed:animate-out data-open:animate-in" />
        <DialogPrimitive.Popup
          className="data-closed:slide-out-to-bottom data-open:slide-in-from-bottom fixed inset-x-0 bottom-0 z-60 max-h-[60vh] overflow-hidden rounded-t-3xl bg-zinc-900/95 backdrop-blur-xl duration-300 data-closed:animate-out data-open:animate-in"
          ref={panelRef}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-white/10 border-b bg-zinc-900/80 p-4 backdrop-blur-sm">
            <h3 className="font-semibold text-lg text-white">
              Todas las imágenes
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
                    "group relative aspect-video overflow-hidden rounded-lg transition-all",
                    currentIndex === index
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-zinc-900"
                      : "opacity-60 hover:opacity-100"
                  )}
                  key={image.src}
                  onClick={() => onSelectImage(index)}
                  ref={currentIndex === index ? selectedRef : null}
                  type="button"
                >
                  <img
                    alt={image.alt}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={image.src}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-1">
                    <span className="font-medium text-white text-xs">
                      {index + 1}
                    </span>
                  </div>
                  {currentIndex === index && (
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
