import { createFileRoute } from "@tanstack/react-router";
import AutoScroll from "embla-carousel-auto-scroll";
import ReactMarkdown from "react-markdown";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/_main/chronos")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "TheChronos",
      },
    ],
  }),
  loader: async () => await orpcClient.chronos.getCurrent(),
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <main className="relative grid w-full min-w-0 grid-cols-1 overflow-x-clip md:grid-cols-4">
      {/* Left sticky image */}
      {data.stickyImageKey && (
        <aside className="col-span-1 hidden md:block">
          <div className="sticky top-0 h-dvh overflow-hidden">
            <img
              src={getBucketUrl(data.stickyImageKey)}
              alt="Sticky"
              className="h-full w-full object-cover"
            />
          </div>
        </aside>
      )}

      {/* Central scrollable content */}
      <article className="flex min-h-screen w-full min-w-0 max-w-full flex-col items-center gap-8 px-4 py-4 md:col-span-2">
        {data.headerImageKey && (
          <img
            alt="Header"
            className="h-auto w-full max-w-full rounded-lg object-cover shadow-lg"
            src={getBucketUrl(data.headerImageKey)}
          />
        )}

        {/* Mobile horizontal carousel */}
        {data.carouselImageKeys && data.carouselImageKeys.length > 0 && (
          <div className="w-full min-w-0 max-w-full overflow-hidden md:hidden">
            <Carousel
              className="w-full max-w-full"
              opts={{
                align: "start",
                loop: true,
              }}
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
                    <img
                      alt={`Carousel ${i + 1}`}
                      className="aspect-video h-auto w-full max-w-full rounded-md border object-cover"
                      src={getBucketUrl(key)}
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

      {/* Right sticky vertical carousel */}
      {data.carouselImageKeys && data.carouselImageKeys.length > 0 && (
        <aside className="col-span-1 hidden md:block">
          <div className="sticky top-0 h-dvh overflow-hidden">
            <Carousel
              className="h-full"
              opts={{
                align: "start",
                dragFree: false,
                loop: true,
              }}
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
                    <img
                      alt={`Carousel ${i + 1}`}
                      className="aspect-video w-full overflow-hidden rounded-md border object-cover"
                      src={getBucketUrl(key)}
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
