import { SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

import type { EngagementPromptType } from "@/lib/types";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Card } from "../ui/card";

type EngagementPromptBlockProps = {
  onAnswerPrompt?: (prompt: EngagementPromptType) => void;
  prompts: EngagementPromptType[];
};

function getRandomDwellMs() {
  return 6000 + Math.floor(Math.random() * 4001);
}

export function EngagementPromptBlock({
  onAnswerPrompt,
  prompts,
}: EngagementPromptBlockProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [isVisibleOnScreen, setIsVisibleOnScreen] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisibleOnScreen(entry?.isIntersecting ?? true);
      },
      {
        threshold: 0.2,
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
    setIsFading(false);
  }, [prompts]);

  useEffect(() => {
    if (prompts.length < 2 || !isPageVisible || !isVisibleOnScreen) {
      return;
    }

    let fadeTimeout: number | undefined;

    if (prefersReducedMotion) {
      const timeout = window.setTimeout(() => {
        setCurrentIndex((current) => (current + 1) % prompts.length);
      }, getRandomDwellMs());

      return () => {
        window.clearTimeout(timeout);
      };
    }

    const dwellTimeout = window.setTimeout(() => {
      setIsFading(true);

      fadeTimeout = window.setTimeout(() => {
        setCurrentIndex((current) => (current + 1) % prompts.length);
        setIsFading(false);
      }, 250);
    }, getRandomDwellMs());

    return () => {
      window.clearTimeout(dwellTimeout);
      if (fadeTimeout !== undefined) {
        window.clearTimeout(fadeTimeout);
      }
    };
  }, [
    currentIndex,
    isPageVisible,
    isVisibleOnScreen,
    prefersReducedMotion,
    prompts.length,
  ]);

  if (prompts.length === 0) {
    return null;
  }

  const currentPrompt = prompts[currentIndex] ?? prompts[0];

  return (
    <section aria-label="Disparador de debate" ref={containerRef}>
      <Card className="flex min-h-24 flex-col justify-center gap-3 px-5 py-4 md:px-6 bg-linear-to-br from-muted/60 via-card to-muted/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 flex-col gap-3">
            <p
              className={cn(
                "max-w-3xl text-balance font-[Lexend] text-base text-foreground leading-relaxed transition-opacity md:text-lg",
                prefersReducedMotion ? "duration-0" : "duration-250",
                isFading ? "opacity-0" : "opacity-100"
              )}
            >
              {currentPrompt?.text}
            </p>
          </div>
          {onAnswerPrompt && currentPrompt && (
            <Button
              className="shrink-0"
              onClick={() => onAnswerPrompt(currentPrompt)}
              type="button"
              variant="secondary"
              size="lg"
            >
              <HugeiconsIcon className="size-4" icon={SentIcon} /> Responder
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
}
