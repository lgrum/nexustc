import { fireEvent, render } from "@testing-library/react";
import type { ImageLoaderProps, ImageProps } from "next/image";

import {
  cloudflareAnimatedLoader,
  cloudflareStillLoader,
  HoverAnimatedImage,
} from "./hover-animated-image";

vi.mock("next/image", () => ({
  default: ({
    alt,
    fill: _fill,
    height: _height,
    loader,
    preload: _preload,
    priority: _priority,
    quality,
    src,
    width: _width,
    ...props
  }: ImageProps & { loader?: (props: ImageLoaderProps) => string }) => (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      {...props}
      alt={alt}
      src={
        loader && typeof src === "string"
          ? loader({ quality: quality as number | undefined, src, width: 320 })
          : String(src)
      }
    />
  ),
}));

const source = "https://assets.example.com/media/cover%20image.webp";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

function renderImage() {
  return render(
    <div className="relative h-40 w-40">
      <HoverAnimatedImage alt="Cover" fill sizes="160px" src={source} />
    </div>
  );
}

describe(HoverAnimatedImage, () => {
  beforeEach(() => setReducedMotion(false));

  it("builds still and animated Cloudflare URLs", () => {
    expect(
      cloudflareStillLoader({ quality: undefined, src: source, width: 640 })
    ).toBe(
      "https://assets.example.com/cdn-cgi/image/anim=false,format=auto,width=640,quality=75/https://assets.example.com/media/cover%20image.webp"
    );
    expect(
      cloudflareAnimatedLoader({ quality: 80, src: source, width: 1280 })
    ).toBe(
      "https://assets.example.com/cdn-cgi/image/anim=true,format=auto,width=1280,quality=80/https://assets.example.com/media/cover%20image.webp"
    );
  });

  it("loads animation only while a mouse hovers", () => {
    const { container } = renderImage();
    const wrapper = container.querySelector("span")!;

    expect(container.querySelectorAll("img")).toHaveLength(1);

    fireEvent.pointerEnter(wrapper, { pointerType: "mouse" });
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[1]?.getAttribute("src")).toContain("anim=true");
    expect(images[1]?.className).toContain("opacity-0");

    fireEvent.load(images[1]!);
    expect(images[1]?.className).toContain("opacity-100");

    fireEvent.pointerLeave(wrapper, { pointerType: "mouse" });
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("supports pen hover", () => {
    const { container } = renderImage();

    fireEvent.pointerEnter(container.querySelector("span")!, {
      pointerType: "pen",
    });

    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("stays still for touch and reduced motion", () => {
    const { container, unmount } = renderImage();
    fireEvent.pointerEnter(container.querySelector("span")!, {
      pointerType: "touch",
    });
    expect(container.querySelectorAll("img")).toHaveLength(1);

    unmount();
    setReducedMotion(true);
    const reducedMotionImage = renderImage();
    fireEvent.pointerEnter(
      reducedMotionImage.container.querySelector("span")!,
      {
        pointerType: "mouse",
      }
    );
    expect(reducedMotionImage.container.querySelectorAll("img")).toHaveLength(
      1
    );
  });

  it("keeps the still visible when animation loading fails", () => {
    const { container } = renderImage();
    fireEvent.pointerEnter(container.querySelector("span")!, {
      pointerType: "mouse",
    });

    fireEvent.error(container.querySelectorAll("img")[1]!);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toContain("anim=false");
  });
});
