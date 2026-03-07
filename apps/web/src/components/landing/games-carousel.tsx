import Autoplay from "embla-carousel-autoplay";
import { useEffect, useState } from "react";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { PostCard, type PostProps } from "./post-card";

export function GamesCarousel({ games }: { games: PostProps[] }) {
  const [api, setApi] = useState<CarouselApi | undefined>();
  const [_current, setCurrent] = useState<number>(0);

  useEffect(() => {
    if (!api) {
      return;
    }
    setCurrent(api.selectedScrollSnap());

    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off?.("select", onSelect);
    };
  }, [api]);

  return (
    <Carousel
      opts={{
        loop: true,
        dragFree: true,
      }}
      plugins={[
        Autoplay({
          delay: 4000,
          stopOnInteraction: false,
        }),
      ]}
      setApi={setApi}
    >
      <CarouselContent className="-ml-3">
        {games.map((game) => (
          <CarouselItem className="basis-1/2 pl-3 md:basis-1/3" key={game.id}>
            <PostCard post={game} />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
