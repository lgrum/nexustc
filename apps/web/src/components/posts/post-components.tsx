import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Clock01Icon,
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
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TermBadge } from "@/components/term-badge";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient } from "@/lib/orpc";
import type { PostType } from "@/lib/types";
import { getBucketUrl } from "@/lib/utils";

import { DiscordLogo } from "../icons/discord";
import { PostCard } from "../landing/post-card";
import type { PostProps as PostCardProps } from "../landing/post-card";
import { Markdown } from "../markdown";
import { RatingDisplay } from "../ratings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "../ui/card";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import type { CarouselApi } from "../ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ImageViewer } from "../ui/image-viewer";
import { ShinyButton } from "../ui/shiny-button";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { BookmarkButton } from "./bookmark-button";
import { CommentSection } from "./comment-section";
import { EngagementPromptBlock } from "./engagement-prompt-block";
import { FollowButton } from "./follow-button";
import { LikeButton } from "./like-button";
import { PostProvider, usePost } from "./post-context";

export type PostProps = Omit<PostType, "favorites" | "isWeekly" | "status"> & {
  averageRating?: number;
  ratingCount?: number;
};

export function PostPage({ post }: { post: PostProps }) {
  const showRestrictedView = post.earlyAccess.isRestrictedView;
  const showComments = !post.earlyAccess.hideComments;
  const showCreatorSupport = !post.earlyAccess.hideCreatorSupport;

  return (
    <PostProvider post={post}>
      <div className="relative flex gap-6 pb-6">
        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <PostHero />
          <EarlyAccessStatusBanner />
          <PostStatsBar />
          <div className="flex flex-col gap-4 px-4 pt-4">
            <PostCarousel />
            <PostInfo />
            <PostContent />
            {!showRestrictedView && <PostTagsSection />}
            {!showRestrictedView && <PostChangelog />}
            {showCreatorSupport && (
              <div className="md:hidden">
                <CreatorSupportCard />
              </div>
            )}
            {!showRestrictedView && (
              <EngagementPromptBlock prompts={post.engagementPrompts} />
            )}
            {showComments && <CommentSection />}
            <TutorialsSection />
            <DiscordSection />
            {!showRestrictedView && (
              <div className="md:hidden">
                <RelatedGamesSection />
              </div>
            )}
          </div>
        </div>
        {/* Sidebar — desktop only */}
        <aside className="hidden w-72 shrink-0 pt-4 pr-4 md:block">
          <div className="sticky top-22 flex flex-col gap-4">
            {showRestrictedView ? (
              <EarlyAccessSidebarCard />
            ) : (
              <PostSidebarContent />
            )}
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
          <div className="aspect-video w-full overflow-hidden md:aspect-21/9 rounded-xl">
            <img
              alt={`Portada de ${post.title}`}
              className="h-full w-full object-cover"
              src={getBucketUrl(mainImage)}
            />
          </div>
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 md:p-10">
            <h1 className="mb-2 font-[Lexend] font-bold text-white text-xl drop-shadow-lg md:text-4xl">
              {post.title}
            </h1>
            <div className="py-2 text-sm">
              {post.version && <Badge variant="default">{post.version}</Badge>}
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

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const createdAt = format(post.createdAt, "PP", { locale: es });
  const updatedAt = format(post.updatedAt, "PP", { locale: es });

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardContent className="flex flex-row gap-1">
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
          {!post.earlyAccess.isActive &&
            post.ratingCount !== undefined &&
            post.ratingCount > 0 && (
              <PostStat
                color="text-primary"
                label="Rating"
                value={`${(post.averageRating ?? 0).toFixed(1)}/10.0`}
              />
            )}
          <PostStat
            color="text-secondary"
            label={createdAt === updatedAt ? "Publicado" : "Actualizado"}
            value={updatedAt}
          />
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-around gap-2">
          <FollowButton contentId={post.id} />
          <BookmarkButton postId={post.id} />
          <LikeButton postId={post.id} />
          {!post.earlyAccess.isActive && (
            <Button
              className="border-yellow-600 bg-yellow-600/30 text-white"
              nativeButton={false}
              render={<Link params={{ id: post.id }} to="/post/reviews/$id" />}
            >
              <RatingDisplay
                averageRating={post.averageRating ?? 0}
                ratingCount={post.ratingCount}
                variant="compact"
              />
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger
              onClick={handleShare}
              render={<Button variant="secondary" />}
            >
              <HugeiconsIcon className="size-4" icon={Share08Icon} />
              Compartir
            </TooltipTrigger>
            <TooltipContent>Copiar enlace al portapapeles</TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>
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
    <Card>
      <CardContent className="flex flex-wrap items-center justify-center gap-2">
        <FollowButton contentId={post.id} />
        <BookmarkButton postId={post.id} />
        <LikeButton postId={post.id} />
        {!post.earlyAccess.isActive && (
          <Button
            className="border-yellow-600 bg-yellow-600/30 text-white"
            nativeButton={false}
            render={<Link params={{ id: post.id }} to="/post/reviews/$id" />}
          >
            <RatingDisplay
              averageRating={post.averageRating ?? 0}
              ratingCount={post.ratingCount}
              variant="compact"
            />
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger
            className="border-green-600 bg-green-600/30 text-white"
            onClick={handleShare}
            render={
              <Button
                className="border-green-600 bg-green-600/30 text-white"
                variant="secondary"
              />
            }
          >
            <HugeiconsIcon className="size-4" icon={Share08Icon} />
            <span className="hidden md:block">Compartir</span>
          </TooltipTrigger>
          <TooltipContent>Copiar enlace al portapapeles</TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

function useCountdown(targetAt: Date | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [targetAt]);

  if (!targetAt) {
    return null;
  }

  const remainingMs = Math.max(targetAt.getTime() - now, 0);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function CountdownCluster({
  label,
  targetAt,
}: {
  label: string;
  targetAt: Date | null;
}) {
  const countdown = useCountdown(targetAt);

  if (!countdown) {
    return null;
  }

  const segments = [
    { label: "D", value: countdown.days },
    { label: "H", value: countdown.hours },
    { label: "M", value: countdown.minutes },
    { label: "S", value: countdown.seconds },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-amber-100/80 text-xs uppercase tracking-[0.22em]">
        <HugeiconsIcon className="size-3.5" icon={Clock01Icon} />
        {label}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {segments.map((segment) => (
          <div
            className="rounded-xl border border-white/8 bg-white/6 px-2 py-3 text-center"
            key={segment.label}
          >
            <div className="font-[Lexend] font-bold text-2xl text-white">
              {String(segment.value).padStart(2, "0")}
            </div>
            <div className="mt-1 text-[10px] text-white/55 uppercase tracking-[0.24em]">
              {segment.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatVipPhaseLabel(post: PostProps): string {
  if (post.earlyAccess.currentState === "VIP12_ONLY") {
    return "VIP 12 exclusivo";
  }

  if (post.earlyAccess.currentState === "VIP8_ONLY") {
    return "VIP 8 desbloqueado";
  }

  return "Publicado";
}

function EarlyAccessStatusBanner() {
  const post = usePost();

  if (!post.earlyAccess.isActive) {
    return null;
  }

  return (
    <section className="px-4 pt-4">
      <div className="overflow-hidden rounded-[32px] border border-amber-400/25 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(33,14,45,0.92))] p-5 shadow-[0_32px_100px_-56px_rgba(251,191,36,0.95)]">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10">
                {formatVipPhaseLabel(post)}
              </Badge>
              <Badge className="border-white/10 bg-white/8 text-white/85 hover:bg-white/8">
                Sale en abierto al terminar la cuenta
              </Badge>
            </div>

            <div className="space-y-2">
              <p className="font-[Lexend] font-bold text-2xl text-white leading-tight">
                {post.earlyAccess.viewerCanAccess
                  ? "Tu cuenta ya entra en esta fase temprana."
                  : `Ahora mismo esta entrega pide ${post.earlyAccess.requiredTierLabel ?? "VIP"}.`}
              </p>
              <p className="max-w-2xl text-sm text-white/72 leading-relaxed">
                Esto se vende como tiempo, no como bloqueo permanente: las
                capturas y la sinopsis quedan visibles para generar deseo, y el
                acceso completo se libera para todos al terminar el Early
                Access.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <CountdownCluster
              label="Cierra la fase actual"
              targetAt={post.earlyAccess.currentPhaseEndsAt}
            />
            <CountdownCluster
              label="Apertura pública"
              targetAt={post.earlyAccess.publicReleaseAt}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function EarlyAccessSidebarCard() {
  const post = usePost();

  if (!post.earlyAccess.isActive) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-amber-400/20 bg-[linear-gradient(180deg,rgba(251,191,36,0.14),rgba(17,24,39,0.92))] p-0">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="text-amber-100/75 text-xs uppercase tracking-[0.28em]">
            VIP Window
          </div>
          <div className="font-[Lexend] font-bold text-xl text-white">
            {post.earlyAccess.requiredTierLabel
              ? `${post.earlyAccess.requiredTierLabel} primero`
              : "Liberado"}
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            El nombre completo, links y social proof se protegen durante esta
            fase para mantener la curiosidad dentro de NeXusTC.
          </p>
        </div>

        <CountdownCluster
          label="Público en"
          targetAt={post.earlyAccess.publicReleaseAt}
        />
      </CardContent>
    </Card>
  );
}

function EarlyAccessDownloadGate() {
  const post = usePost();
  const { data: session } = authClient.useSession();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!post.earlyAccess.isActive) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Descargas</div>
      <Card className="overflow-hidden border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_42%),rgba(15,23,42,0.92)]">
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10">
              {post.earlyAccess.requiredTierLabel ?? "VIP"} requerido ahora
            </Badge>
            <h3 className="font-[Lexend] font-bold text-2xl text-white">
              Puedes mirar todo lo que quieras. El archivo llega primero a VIP.
            </h3>
            <p className="max-w-2xl text-sm text-white/70 leading-relaxed">
              Así la presión se siente temporal, no punitiva: pagas por jugar
              antes, no por acceso permanente. Cuando la cuenta termine, este
              mismo post quedará libre para todos.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <CountdownCluster
              label="Fase actual"
              targetAt={post.earlyAccess.currentPhaseEndsAt}
            />
            <CountdownCluster
              label="Público en"
              targetAt={post.earlyAccess.publicReleaseAt}
            />
          </div>

          <Button
            className="h-12 rounded-full bg-amber-400 text-slate-950 hover:bg-amber-300"
            onClick={() => setDialogOpen(true)}
            type="button"
          >
            <HugeiconsIcon className="size-4" icon={Download04Icon} />
            Descargar en Early Access
          </Button>
        </CardContent>
      </Card>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="max-w-xl overflow-hidden border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_42%),rgba(15,23,42,0.98)] text-white">
          <DialogHeader>
            <DialogTitle className="font-[Lexend] text-2xl text-white">
              Esta descarga abre primero para{" "}
              {post.earlyAccess.requiredTierLabel ?? "VIP"}
            </DialogTitle>
            <DialogDescription className="text-white/72">
              Puedes esperar al lanzamiento público o subir de nivel ahora
              mismo. El contenido no desaparece: solo cambia cuándo se libera
              para ti.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <CountdownCluster
              label="Fase actual"
              targetAt={post.earlyAccess.currentPhaseEndsAt}
            />
            <CountdownCluster
              label="Se libera para todos"
              targetAt={post.earlyAccess.publicReleaseAt}
            />
          </div>

          <DialogFooter className="bg-white/5">
            {session?.session ? (
              <Button nativeButton={false} render={<Link to="/profile" />}>
                Mejorar ahora
              </Button>
            ) : (
              <Button nativeButton={false} render={<Link to="/auth" />}>
                Mejorar ahora
              </Button>
            )}
            <Button onClick={() => setDialogOpen(false)} variant="outline">
              Esperar al lanzamiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    queryFn: () =>
      orpcClient.post.getRelated({ postId: post.id, type: post.type }),
    queryKey: ["related", post.id],
  });

  return (
    <div className="flex flex-col gap-4">
      <CreatorSupportCard />

      <div className="flex flex-col gap-3">
        <div className="section-title">Recomendados</div>
        <div className="flex flex-col gap-3">
          {isLoading &&
            Array.from({ length: 5 }, (_, i) => (
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
    queryFn: () =>
      orpcClient.post.getRelated({ postId: post.id, type: post.type }),
    queryKey: ["related", post.id],
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Recomendados</div>
      {isLoading && (
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
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
    alt: `${post.title} - Imagen ${index + 1}`,
    src: getBucketUrl(key),
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
              dragFree: true,
              loop: true,
            }}
            plugins={[
              AutoScroll({
                playOnInit: true,
                speed: 1,
                startDelay: 0,
                stopOnInteraction: false,
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
        <Markdown>{post.content}</Markdown>
      </div>
    )
  );
}

export function PostContent() {
  const post = usePost();
  const hasDownloadLinks = !!post.adsLinks;
  const hasChangelog = !!post.changelog;
  const hasPremium = post.premiumLinksAccess.status !== "no_premium_links";
  const hasAnyDownloadSurface = hasDownloadLinks || hasPremium;

  if (!(hasDownloadLinks || hasChangelog || hasPremium)) {
    return null;
  }

  if (post.earlyAccess.isActive && !post.earlyAccess.viewerCanAccess) {
    return hasAnyDownloadSurface ? <EarlyAccessDownloadGate /> : null;
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
      <Card>
        <Tabs className="w-full" defaultValue={defaultTab}>
          <CardHeader>
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
          </CardHeader>
          <CardContent className="px-6">
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
          </CardContent>
        </Tabs>
      </Card>
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
          dragFree: true,
          loop: true,
        }}
        plugins={[
          Autoplay({
            delay: 10_000,
            playOnInit: true,
            stopOnInteraction: true,
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
          // oxlint-disable-next-line jsx_a11y/anchor-has-content: the anchor has content, but it's rendered through the Button's `children` prop
          <a
            href="https://discord.nexustc18.com/"
            rel="noreferrer"
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
  if (post.earlyAccess.hideCreatorSupport || !hasCreator) {
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
    <Card className="p-2">
      <CardContent className="flex flex-row gap-2 p-1">
        <div className="h-full w-1 bg-accent rounded-xl" />
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
      </CardContent>
    </Card>
  );
}
