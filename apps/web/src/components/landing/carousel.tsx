import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Autoplay from "embla-carousel-autoplay";
import { useEffect, useState } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

import { AndroidLogo } from "../icons/android";
import { IOSLogo } from "../icons/ios";
import { WindowsLogo } from "../icons/windows";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const items = [
  {
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    id: 1,
    imageUrl: "https://picsum.photos/id/1/1200/800",
    title: "Lorem ipsum dolor sit amet",
  },
  {
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    id: 2,
    imageUrl: "https://picsum.photos/id/2/1200/800",
    title: "Lorem ipsum dolor sit amet",
  },
  {
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    id: 3,
    imageUrl: "https://picsum.photos/id/3/1200/800",
    title: "Lorem ipsum dolor sit amet",
  },
  {
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    id: 4,
    imageUrl: "https://picsum.photos/id/4/1200/800",
    title: "Lorem ipsum dolor sit amet",
  },
  {
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    id: 5,
    imageUrl: "https://picsum.photos/id/5/1200/800",
    title: "Lorem ipsum dolor sit amet",
  },
  {
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    id: 6,
    imageUrl: "https://picsum.photos/id/4/1200/800",
    title: "Lorem ipsum dolor sit amet",
  },
  {
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    id: 7,
    imageUrl: "https://picsum.photos/id/7/1200/800",
    title: "Lorem ipsum dolor sit amet",
  },
];

export function LandingCarousel() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  return (
    <section className="w-full">
      <Carousel
        opts={{
          dragFree: true,
          loop: true,
        }}
        plugins={[
          Autoplay({
            delay: 4000,
            stopOnInteraction: false,
          }),
        ]}
        setApi={setApi}
      >
        <CarouselContent>
          {items.map((item) => (
            <CarouselItem
              className="basis-1/2 md:basis-1/3 lg:basis-1/4"
              key={item.id}
            >
              <div className="p-1">
                <Post post={{ ...item, tags: ["2D", "Milf", "BDSM"] }} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <div className="flex items-center justify-center gap-2">
        {items.map((item, index) => (
          <button
            className={cn(
              "size-4 cursor-pointer rounded-full border",
              current === index && "bg-primary"
            )}
            key={item.id}
            onClick={() => api?.scrollTo(index)}
            type="button"
          />
        ))}
      </div>
    </section>
  );
}

function Post({
  post,
}: {
  post: { title: string; imageUrl: string; tags: string[] };
}) {
  return (
    <Card className="relative overflow-clip pt-0 ring-primary hover:ring">
      <div className="relative">
        <img
          alt={post.title}
          className="aspect-video object-cover"
          src={post.imageUrl}
        />
        <div className="absolute bottom-0 flex w-full items-end justify-between p-2">
          <div className="flex flex-row items-center gap-4 rounded-md bg-background/50 px-3 py-2 backdrop-blur">
            <div className="flex flex-row items-center gap-2">
              <HugeiconsIcon className="size-5" icon={FavouriteIcon} /> 10
            </div>
          </div>

          <div className="flex flex-row items-center gap-2 rounded-md bg-background/50 px-3 py-2 backdrop-blur">
            <WindowsLogo className="size-4" />
            <AndroidLogo className="size-6" />
            <IOSLogo className="size-6" />
          </div>
        </div>
      </div>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">{post.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-row items-center gap-4 text-sm">
          {post.tags.map((tag) => (
            <Badge key={tag} variant="default">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
      {/* <div className="absolute bottom-0 flex w-full items-end justify-between gap-4 p-4">
        <div className="flex flex-col gap-2 rounded-md bg-background/50 p-4 backdrop-blur">
          <div className="flex items-center gap-4">
            <h2 className="line-clamp-1 font-extrabold text-2xl">
              {post.title} {post.title}
            </h2>
          </div>
          <div className="flex flex-row items-center gap-4 text-sm">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-row items-center gap-4 rounded-md bg-background/50 p-4 backdrop-blur">
          <WindowsLogo className="size-6" />
          <AndroidLogo className="size-8" />
          <IOSLogo className="size-8" />
        </div>
      </div> */}
    </Card>
  );
}
