"use client";

import type { chronosPage } from "@repo/db/schema/app";
import AutoScroll from "embla-carousel-auto-scroll";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { getBucketUrl } from "@/lib/utils";

type ChronosData = typeof chronosPage.$inferSelect;

export function ChronosClient({ data }: { data: ChronosData }) {
  return (
    <main className="relative grid w-full min-w-0 grid-cols-1 overflow-x-clip md:grid-cols-4">
      {data.stickyImageKey && (
        <aside className="col-span-1 hidden md:block">
          <div className="sticky top-0 h-dvh overflow-hidden">
            <Image
              alt="Sticky"
              className="object-cover"
              fill
              sizes="25vw"
              src={getBucketUrl(data.stickyImageKey)}
            />
          </div>
        </aside>
      )}

      <article className="flex min-h-screen w-full min-w-0 max-w-full flex-col items-center gap-8 px-4 py-4 md:col-span-2">
        {data.headerImageKey && (
          <Image
            alt="Header"
            className="h-auto w-full max-w-full rounded-lg object-cover shadow-lg"
            height={900}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            src={getBucketUrl(data.headerImageKey)}
            width={1600}
          />
        )}

        {data.carouselImageKeys && data.carouselImageKeys.length > 0 && (
          <div className="w-full min-w-0 max-w-full overflow-hidden md:hidden">
            <Carousel
              className="w-full max-w-full"
              opts={{ align: "start", loop: true }}
              plugins={[
                AutoScroll({
                  speed: 1,
                  startDelay: 0,
                  stopOnInteraction: false,
                }),
              ]}
            >
              <CarouselContent>
                {data.carouselImageKeys.map((key, i) => (
                  <CarouselItem className="basis-4/5" key={key}>
                    <Image
                      alt={`Carousel ${i + 1}`}
                      className="aspect-video h-auto w-full max-w-full rounded-md border object-cover"
                      height={720}
                      sizes="80vw"
                      src={getBucketUrl(key)}
                      width={1280}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>
        )}

        <div
          className="prose dark:prose-invert w-full min-w-0 max-w-full wrap-break-word [overflow-wrap:anywhere] [&_a]:text-primary [&_iframe]:max-w-full [&_img]:h-auto [&_img]:max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:w-full"
          role="document"
        >
          <ReactMarkdown
            components={{
              img: ({ alt, src }) => (
                // eslint-disable-next-line @next/next/no-img-element -- Markdown may contain arbitrary external or data URLs without stable dimensions.
                <img alt={alt ?? ""} loading="lazy" src={src ?? ""} />
              ),
              table: ({ children }) => (
                <div className="w-full max-w-full overflow-x-auto">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {data.markdownContent}
          </ReactMarkdown>
        </div>
      </article>

      {data.carouselImageKeys && data.carouselImageKeys.length > 0 && (
        <aside className="col-span-1 hidden md:block">
          <div className="sticky top-0 h-dvh overflow-hidden">
            <Carousel
              className="h-full"
              opts={{ align: "start", dragFree: false, loop: true }}
              orientation="vertical"
              plugins={[
                AutoScroll({
                  speed: 1,
                  startDelay: 0,
                  stopOnInteraction: false,
                }),
              ]}
            >
              <CarouselContent className="h-[102dvh]">
                {data.carouselImageKeys.map((key, i) => (
                  <CarouselItem className="basis-auto" key={key}>
                    <Image
                      alt={`Carousel ${i + 1}`}
                      className="aspect-video w-full overflow-hidden rounded-md border object-cover"
                      height={720}
                      sizes="25vw"
                      src={getBucketUrl(key)}
                      width={1280}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>
        </aside>
      )}
    </main>
  );
}
