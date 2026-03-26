import { useCallback, useEffect, useRef, useState } from "react";

type AnimatedAssetProps = {
  src: string;
  alt: string;
  className?: string;
};

export function AnimatedAsset({ src, alt, className }: AnimatedAssetProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [frozenSrc, setFrozenSrc] = useState<string | null>(null);
  const hasPlayed = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const freezeFrame = useCallback((img: HTMLImageElement) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setFrozenSrc(canvas.toDataURL());
      }
    } catch {
      // CORS or other issues — leave animated
    }
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return;
        }

        if (entry.isIntersecting && !hasPlayed.current) {
          hasPlayed.current = true;
          setFrozenSrc(null);

          timerRef.current = setTimeout(() => {
            freezeFrame(img);
          }, 3000);
        } else if (!entry.isIntersecting && hasPlayed.current && !frozenSrc) {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
          freezeFrame(img);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(img);

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [frozenSrc, freezeFrame]);

  return (
    <img
      alt={alt}
      className={className}
      loading="lazy"
      ref={imgRef}
      src={frozenSrc ?? src}
    />
  );
}
