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
    <main className="relative grid w-full md:grid-cols-4">
      {/* Left sticky image */}
      {data.stickyImageKey && (
        <div
          className="sticky top-0 col-span-1 hidden h-screen bg-center bg-cover md:block"
          style={{
            backgroundImage: `url(${getBucketUrl(data.stickyImageKey)})`,
          }}
        />
      )}

      {/* Central scrollable content */}
      <article className="col-span-2 flex min-h-screen w-full flex-col items-center gap-8 px-4 py-4">
        {data.headerImageKey && (
          <img
            alt="Header"
            className="w-full rounded-lg object-cover shadow-lg"
            src={getBucketUrl(data.headerImageKey)}
          />
        )}

        {/* Mobile horizontal carousel */}
        {data.carouselImageKeys && data.carouselImageKeys.length > 0 && (
          <div className="w-full md:hidden">
            <Carousel
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
                      className="aspect-video w-full rounded-md border object-cover"
                      src={getBucketUrl(key)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>
        )}

        <div className="prose dark:prose-invert w-full max-w-none">
          <ReactMarkdown>{data.markdownContent}</ReactMarkdown>
        </div>
      </article>

      {/* Right sticky vertical carousel */}
      {data.carouselImageKeys && data.carouselImageKeys.length > 0 && (
        <div className="sticky top-0 col-span-1 hidden h-dvh overflow-hidden md:block">
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
      )}
    </main>
  );
}
