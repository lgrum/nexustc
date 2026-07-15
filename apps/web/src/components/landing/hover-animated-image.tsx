"use client";

import Image from "next/image";
import type { ImageLoader, ImageLoaderProps, ImageProps } from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

const cloudflareImageUrl = (
  { src, width, quality }: ImageLoaderProps,
  animated: boolean
) => {
  const source = new URL(src);
  const options = `anim=${animated},format=auto,width=${width},quality=${quality ?? 75}`;

  return `${source.origin}/cdn-cgi/image/${options}/${source.href}`;
};

export const cloudflareStillLoader: ImageLoader = (props) =>
  cloudflareImageUrl(props, false);

export const cloudflareAnimatedLoader: ImageLoader = (props) =>
  cloudflareImageUrl(props, true);

export type HoverAnimatedImageProps = Omit<ImageProps, "loader" | "src"> & {
  src: string;
};

export function HoverAnimatedImage({
  className,
  fill,
  ...props
}: HoverAnimatedImageProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [animationReady, setAnimationReady] = useState(false);

  const stopAnimation = () => {
    setShouldAnimate(false);
    setAnimationReady(false);
  };

  return (
    <span
      className={fill ? "absolute inset-0" : "relative block h-full w-full"}
      onPointerEnter={(event) => {
        const supportsHover =
          event.pointerType === "mouse" || event.pointerType === "pen";
        if (
          supportsHover &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          setShouldAnimate(true);
        }
      }}
      onPointerLeave={stopAnimation}
    >
      <Image
        {...props}
        className={className}
        fill
        height={undefined}
        loader={cloudflareStillLoader}
        width={undefined}
      />
      {shouldAnimate ? (
        <Image
          {...props}
          alt=""
          aria-hidden
          className={cn(
            "pointer-events-none",
            className,
            animationReady ? "opacity-100" : "opacity-0"
          )}
          fill
          height={undefined}
          loader={cloudflareAnimatedLoader}
          loading="eager"
          onError={stopAnimation}
          onLoad={() => setAnimationReady(true)}
          preload={false}
          priority={false}
          width={undefined}
        />
      ) : null}
    </span>
  );
}
