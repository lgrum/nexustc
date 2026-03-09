import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Download04Icon,
  FavouriteCircleIcon,
  Share08Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PremiumLinksDescriptor } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import AutoScroll from "embla-carousel-auto-scroll";
import Autoplay from "embla-carousel-autoplay";
import { useState } from "react";
import { toast } from "sonner";
import { TermBadge } from "@/components/term-badge";
import { orpc, orpcClient } from "@/lib/orpc";
import type { PostType } from "@/lib/types";
import { getBucketUrl } from "@/lib/utils";
import { DiscordLogo } from "../icons/discord";
import {
  PostCard,
  type PostProps as PostCardProps,
} from "../landing/post-card";
import { Markdown } from "../markdown";
import { RatingDisplay } from "../ratings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "../ui/carousel";
import { ImageViewer } from "../ui/image-viewer";
import { ShinyButton } from "../ui/shiny-button";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { BookmarkButton } from "./bookmark-button";
import { CommentSection } from "./comment-section";
import { EngagementPromptBlock } from "./engagement-prompt-block";
import { LikeButton } from "./like-button";
import { PostProvider, usePost } from "./post-context";

export type PostProps = Omit<PostType, "favorites" | "isWeekly" | "status"> & {
  averageRating?: number;
  ratingCount?: number;
};

export function PostPage({ post }: { post: PostProps }) {
  return (
    <PostProvider post={post}>
      <div className="relative flex gap-6 pb-6">
        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <PostHero />
          <PostStatsBar />
          <div className="flex flex-col gap-4 px-4 pt-4">
            <PostCarousel />
            <PostContent />
            <PostInfo />
            <PostTagsSection />
            <PostChangelog />
            <div className="md:hidden">
              <CreatorSupportCard />
            </div>
            <EngagementPromptBlock prompts={post.engagementPrompts} />
            <CommentSection />
            <TutorialsSection />
            <DiscordSection />
            <div className="md:hidden">
              <RelatedGamesSection />
            </div>
          </div>
        </div>
        {/* Sidebar — desktop only */}
        <aside className="hidden w-72 shrink-0 pt-4 pr-4 md:block">
          <div className="sticky top-22 flex flex-col gap-4">
            <PostSidebarContent />
          </div>
        </aside>
      </div>
    </PostProvider>
  );
}

export function PostHero() {
  const post = usePost();
  const mainImage = post.imageObjectKeys?.[0];

  return (
    <div className="relative">
      {mainImage ? (
        <div className="relative">
          <div className="aspect-video w-full overflow-hidden md:aspect-21/9">
            <img
              alt={`Portada de ${post.title}`}
              className="h-full w-full object-cover"
              src={getBucketUrl(mainImage)}
            />
          </div>
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 md:p-10">
            <h1 className="mb-2 font-[Lexend] font-bold text-white text-xl drop-shadow-lg md:text-4xl">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
              {post.version && (
                <Badge
                  className="border-white/30 bg-white/20 text-white backdrop-blur-sm"
                  variant="outline"
                >
                  {post.version}
                </Badge>
              )}
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon className="size-3.5" icon={Calendar03Icon} />
                {format(post.createdAt, "d 'de' MMMM, yyyy", { locale: es })}
              </span>
              {post.ratingCount !== undefined && post.ratingCount > 0 && (
                <RatingDisplay
                  averageRating={post.averageRating ?? 0}
                  ratingCount={post.ratingCount}
                  variant="compact"
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 bg-linear-to-br from-primary/20 via-primary/10 to-transparent p-8 md:p-12">
          <h1 className="font-[Lexend] font-bold text-3xl md:text-5xl">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            {post.version && <Badge variant="secondary">{post.version}</Badge>}
            <Badge className="gap-1.5" variant="secondary">
              <HugeiconsIcon className="size-3.5" icon={Calendar03Icon} />
              {format(post.createdAt, "d 'de' MMMM, yyyy", { locale: es })}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

export function PostStatsBar() {
  const post = usePost();
  return (
    <div className="border-border border-b bg-card">
      <div className="flex gap-1 px-2 py-2">
        <PostStat
          color="text-foreground"
          label="Vistas"
          value={String(post.views)}
        />
        <PostStat
          color="text-accent"
          label="Me gusta"
          value={String(post.likes)}
        />
        {post.ratingCount !== undefined && post.ratingCount > 0 && (
          <PostStat
            color="text-primary"
            label="Rating"
            value={`${(post.averageRating ?? 0).toFixed(1)}/10`}
          />
        )}
        <PostStat
          color="text-secondary"
          label="Publicado"
          value={format(post.createdAt, "PP", { locale: es })}
        />
      </div>
      <PostActionBar />
    </div>
  );
}

function PostStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 py-2">
      <span className={`whitespace-nowrap font-bold text-sm ${color}`}>
        {value}
      </span>
      <span className="whitespace-nowrap font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

export function PostActionBar() {
  const post = usePost();
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  return (
    <div className="flex items-center justify-around gap-2 border-border border-t px-4 py-2">
      <BookmarkButton postId={post.id} />
      <LikeButton postId={post.id} />
      <Button
        nativeButton={false}
        render={<Link params={{ id: post.id }} to={"/post/reviews/$id"} />}
        size="sm"
        variant="outline"
      >
        <RatingDisplay
          averageRating={post.averageRating ?? 0}
          ratingCount={post.ratingCount}
          variant="compact"
        />
      </Button>
      <Tooltip>
        <TooltipTrigger
          onClick={handleShare}
          render={
            <Button size="sm" variant="outline">
              <HugeiconsIcon className="size-4" icon={Share08Icon} />
              <span className="hidden md:block">Compartir</span>
            </Button>
          }
        />
        <TooltipContent>Copiar enlace al portapapeles</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function PostTagsSection() {
  const post = usePost();
  const groupedTerms = Object.groupBy(post.terms, (term) => term.taxonomy);
  const hasTags = post.terms.length > 0;

  return (
    hasTags && (
      <div className="flex flex-col gap-3">
        <div className="section-title">Tags</div>

        {/* Categorized Tags */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <TagCategory label="Plataformas" terms={groupedTerms.platform} />
          <TagCategory label="Idiomas" terms={groupedTerms.language} />
          <TagCategory label="Motor" terms={groupedTerms.engine} />
          <TagCategory label="Gráficos" terms={groupedTerms.graphics} />
          <TagCategory label="Censura" terms={groupedTerms.censorship} />
          <TagCategory label="Estado" terms={groupedTerms.status} />
        </div>

        {/* Main Tags */}
        {groupedTerms.tag && groupedTerms.tag.length > 0 && (
          <>
            <div className="glow-line" />
            <div className="flex flex-wrap gap-2">
              {groupedTerms.tag.map((term) => (
                <TermBadge key={term.id} tag={term} />
              ))}
            </div>
          </>
        )}
      </div>
    )
  );
}

export function PostSidebarContent() {
  const post = usePost();
  const { data: related, isLoading } = useQuery({
    queryKey: ["related", post.id],
    queryFn: () =>
      orpcClient.post.getRelated({ postId: post.id, type: post.type }),
  });

  return (
    <div className="flex flex-col gap-4">
      <CreatorSupportCard />

      <div className="flex flex-col gap-3">
        <div className="section-title">Recomendados</div>
        <div className="flex flex-col gap-3">
          {isLoading &&
            Array.from({ length: 5 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: loading placeholder
              <Skeleton className="h-28 w-full" key={i} />
            ))}
          {!isLoading && related?.length === 0 && (
            <p className="text-center text-muted-foreground text-sm">
              Sin recomendaciones disponibles
            </p>
          )}
          {related?.map((item: PostCardProps) => (
            <PostCard key={item.id} post={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RelatedGamesSection() {
  const post = usePost();
  const { data: related, isLoading } = useQuery({
    queryKey: ["related", post.id],
    queryFn: () =>
      orpcClient.post.getRelated({ postId: post.id, type: post.type }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Recomendados</div>
      {isLoading && (
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: loading placeholder
            <Skeleton className="aspect-video w-full" key={i} />
          ))}
        </div>
      )}
      {!isLoading && related && related.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {related.map((item: PostCardProps) => (
            <PostCard key={item.id} post={item} />
          ))}
        </div>
      )}
      {!isLoading && (!related || related.length === 0) && (
        <p className="text-center text-muted-foreground text-sm">
          Sin recomendaciones disponibles
        </p>
      )}
    </div>
  );
}

export function PostCarousel() {
  const post = usePost();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const allImages = post.imageObjectKeys ?? [];
  const galleryImages = allImages.map((key, index) => ({
    src: getBucketUrl(key),
    alt: `${post.title} - Imagen ${index + 1}`,
  }));
  const hasImages = (post.imageObjectKeys?.length ?? 0) > 0;

  return (
    hasImages && (
      <div className="flex flex-col gap-3">
        <div className="section-title">Galería</div>
        {allImages.length > 0 && (
          <Carousel
            opts={{
              align: "start",
              loop: true,
              dragFree: true,
            }}
            plugins={[
              AutoScroll({
                playOnInit: true,
                startDelay: 0,
                stopOnInteraction: false,
                speed: 1,
              }),
            ]}
          >
            <CarouselContent>
              {allImages.map((image, index) => (
                <CarouselItem className="basis-2/3 md:basis-1/3" key={image}>
                  <button
                    className="group aspect-video w-full cursor-pointer overflow-hidden border border-border bg-card transition-all"
                    onClick={() => {
                      setSelectedImageIndex(index);
                      setGalleryOpen(true);
                    }}
                    type="button"
                  >
                    <img
                      alt={`Miniatura ${index + 1}`}
                      className="h-full w-full object-cover transition-transform group-hover:scale-110"
                      src={getBucketUrl(image)}
                    />
                  </button>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        )}

        <ImageViewer
          images={galleryImages}
          initialIndex={selectedImageIndex}
          onOpenChange={setGalleryOpen}
          open={galleryOpen}
          title={post.title}
        />
      </div>
    )
  );
}

export function PostInfo() {
  const post = usePost();
  const hasContent = post.content !== "";

  return (
    hasContent && (
      <div className="flex flex-col gap-3">
        <div className="section-title">Sinopsis</div>
        <div className="border border-border bg-card p-4">
          <Markdown>{post.content}</Markdown>
        </div>
      </div>
    )
  );
}

export function PostContent() {
  const post = usePost();
  const hasDownloadLinks = !!post.adsLinks;
  const hasChangelog = !!post.changelog;
  const hasPremium = post.premiumLinksAccess.status !== "no_premium_links";

  if (!(hasDownloadLinks || hasChangelog || hasPremium)) {
    return null;
  }

  const defaultTab =
    hasPremium && post.premiumLinksAccess.status === "granted"
      ? "premium"
      : hasDownloadLinks
        ? "downloads"
        : hasChangelog
          ? "changelog"
          : "downloads";

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Descargas</div>
      <div className="border border-border bg-card p-4">
        <Tabs className="w-full" defaultValue={defaultTab}>
          <TabsList className="w-full justify-start">
            {hasDownloadLinks && (
              <TabsTrigger className="gap-2" value="downloads">
                <HugeiconsIcon className="size-4" icon={Download04Icon} />
                Anuncios
              </TabsTrigger>
            )}
            {hasPremium && (
              <TabsTrigger className="gap-2" value="premium">
                <HugeiconsIcon className="size-4" icon={StarIcon} />
                Premium
              </TabsTrigger>
            )}
          </TabsList>

          {hasDownloadLinks && (
            <TabsContent value="downloads">
              <Markdown>{post.adsLinks ?? ""}</Markdown>
            </TabsContent>
          )}

          {hasPremium && (
            <TabsContent value="premium">
              <PremiumLinksContent descriptor={post.premiumLinksAccess} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

export function PostChangelog() {
  const post = usePost();
  if (!post.changelog) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Changelog</div>
      <div className="border border-border bg-card p-4">
        <Markdown>{post.changelog}</Markdown>
      </div>
    </div>
  );
}

function PremiumLinksContent({
  descriptor,
}: {
  descriptor: PremiumLinksDescriptor;
}) {
  if (descriptor.status === "no_premium_links") {
    return null;
  }

  if (descriptor.status === "granted") {
    return <Markdown>{descriptor.content}</Markdown>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded border border-primary/30 border-dashed bg-linear-to-br from-primary/5 to-secondary/5 py-16">
      <div className="rounded-full bg-muted p-4">
        <HugeiconsIcon
          className="size-8 text-muted-foreground"
          icon={StarIcon}
        />
      </div>
      <p className="text-center text-muted-foreground">
        {descriptor.status === "denied_need_patron"
          ? "Hazte patrocinador para acceder a los enlaces premium"
          : `Necesitas ${descriptor.requiredTierLabel} o superior para acceder a estos enlaces`}
      </p>
    </div>
  );
}

export function TutorialsSection() {
  const tutorials = useQuery(orpc.extras.getTutorials.queryOptions());
  const [api, setApi] = useState<CarouselApi>();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="section-title">Tutoriales</div>
        <div className="flex gap-2">
          <Button
            onClick={() => api?.scrollPrev()}
            size="icon"
            variant="outline"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <Button
            onClick={() => api?.scrollNext()}
            size="icon"
            variant="outline"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
      <Carousel
        opts={{
          loop: true,
          dragFree: true,
        }}
        plugins={[
          Autoplay({
            playOnInit: true,
            stopOnInteraction: true,
            delay: 10_000,
          }),
        ]}
        setApi={setApi}
      >
        <CarouselContent>
          {tutorials.data?.map((tutorial) => (
            <CarouselItem
              className="basis-4/5 p-1 pl-3 md:basis-1/3"
              key={tutorial.id}
            >
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="aspect-video w-full border border-border"
                referrerPolicy="strict-origin-when-cross-origin"
                src={tutorial.embedUrl}
                title="YouTube video player"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}

export function DiscordSection() {
  return (
    <div className="py-2">
      <ShinyButton
        className="inline-flex w-full items-center justify-center gap-4 hover:bg-[#5865F2]/90"
        nativeButton={false}
        render={
          // biome-ignore lint/a11y/useAnchorContent: the anchor has content, but it's rendered through the Button's `children` prop
          <a
            href="https://discord.nexustc18.com/"
            rel="noopener"
            target="_blank"
          />
        }
      >
        <div className="inline-flex items-center gap-4 text-center font-[Lexend] font-bold text-2xl text-white uppercase">
          <DiscordLogo className="size-8" /> Únete a nuestro Discord
        </div>
      </ShinyButton>
    </div>
  );
}

/* ============================================================================
   Helper Components
   ============================================================================ */

export function CreatorSupportCard() {
  const post = usePost();
  const hasCreator = !!post.creatorName || !!post.creatorLink;
  if (!hasCreator) {
    return null;
  }

  const Comp = post.creatorLink ? "a" : "div";
  return (
    <Comp
      className="group relative block overflow-hidden border border-border bg-card p-0.5 transition-shadow hover:shadow-lg hover:shadow-primary/10"
      href={post.creatorLink}
      rel="noopener"
      target="_blank"
    >
      {/* Animated gradient border */}
      <div className="absolute inset-0 animate-pulse bg-linear-to-r from-primary via-secondary to-accent" />

      {/* Inner content */}
      <div className="relative flex items-center gap-4 bg-card p-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/20 via-secondary/20 to-accent/20">
          <HugeiconsIcon
            className="size-6 text-primary"
            icon={FavouriteCircleIcon}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-[Lexend] font-bold text-base">
            Apoya al Creador
          </span>
          {post.creatorName && (
            <span className="text-muted-foreground text-sm">
              {post.creatorName}
            </span>
          )}
        </div>
      </div>
    </Comp>
  );
}

function TagCategory({
  label,
  terms,
}: {
  label: string;
  terms:
    | { id: string; name: string; color: string | null | undefined }[]
    | undefined;
}) {
  if (!terms || terms.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-row gap-2 bg-muted/30 p-2">
      <div className="h-full w-1 bg-accent" />
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-accent text-xs uppercase tracking-wider">
          {label}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {terms.map((term) => (
            <TermBadge className="text-xs" key={term.id} tag={term} />
          ))}
        </div>
      </div>
    </div>
  );
}
