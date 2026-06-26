import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Clock01Icon,
  Download04Icon,
  FavouriteCircleIcon,
  FavouriteIcon,
  Share08Icon,
  ShuffleSquareIcon,
  StarIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PREMIUM_STATUS_CATEGORIES } from "@repo/shared/constants";
import type { PremiumLinksDescriptor } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import AutoScroll from "embla-carousel-auto-scroll";
import Autoplay from "embla-carousel-autoplay";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { TermBadge } from "@/components/term-badge";
import { usePostViewTracker } from "@/hooks/use-post-view-tracker";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient } from "@/lib/orpc";
import {
  getCoverImageObjectKey,
  getGalleryImageObjectKeys,
} from "@/lib/post-images";
import type { EngagementPromptType, PostType } from "@/lib/types";
import { cn, getBucketUrl } from "@/lib/utils";

import { DiscordLogo } from "../icons/discord";
import { PostCard } from "../landing/post-card";
import type { PostProps as PostCardProps } from "../landing/post-card";
import { Markdown } from "../markdown";
import { RatingDisplay } from "../ratings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import type { CarouselApi } from "../ui/carousel";
import { ImageViewer } from "../ui/image-viewer";
import { ShinyButton } from "../ui/shiny-button";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { BookmarkButton } from "./bookmark-button";
import { CommentSection } from "./comment-section";
import { EngagementPromptBlock } from "./engagement-prompt-block";
import { FollowButton } from "./follow-button";
import { LikeButton } from "./like-button";
import { PostActionButton } from "./post-action-button";
import { PostProvider, usePost } from "./post-context";

export type PostProps = Omit<PostType, "favorites" | "isWeekly" | "status"> & {
  averageRating?: number;
  ratingCount?: number;
};

const ABANDONED_STATUS_NAME = "Abandonado";

export function getVersionBadgeClassName(statusName: string | undefined) {
  if (statusName === ABANDONED_STATUS_NAME) {
    return "border-red-500/40 bg-red-500/20 text-red-200";
  }

  if (
    statusName !== undefined &&
    PREMIUM_STATUS_CATEGORIES.ongoing.includes(
      statusName as (typeof PREMIUM_STATUS_CATEGORIES.ongoing)[number]
    )
  ) {
    return "border-amber-400/40 bg-amber-400/20 text-amber-100";
  }

  if (
    statusName !== undefined &&
    PREMIUM_STATUS_CATEGORIES.completed.includes(
      statusName as (typeof PREMIUM_STATUS_CATEGORIES.completed)[number]
    )
  ) {
    return "border-emerald-500/40 bg-emerald-500/20 text-emerald-100";
  }

  return "border-white/25 bg-white/15 text-white/90";
}

export function PostPage({ post }: { post: PostProps }) {
  const showRestrictedView = post.earlyAccess.isRestrictedView;
  const showComments = !post.earlyAccess.hideComments;
  const showCreatorSupport = !post.earlyAccess.hideCreatorSupport;
  const [selectedPrompt, setSelectedPrompt] =
    useState<EngagementPromptType | null>(null);
  const viewTargetRef = useRef<HTMLDivElement | null>(null);

  usePostViewTracker({
    enabled: !showRestrictedView,
    postId: post.id,
    targetRef: viewTargetRef,
  });

  return (
    <PostProvider post={post}>
      <div className="relative flex gap-6 pb-6">
        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <PostHero />
          <EarlyAccessStatusBanner />
          {!showRestrictedView && <PostStatsBar />}
          <div className="flex flex-col gap-4 px-4 pt-4">
            {!showRestrictedView && (
              <div aria-hidden="true" className="h-px" ref={viewTargetRef} />
            )}
            <PostCarousel />
            <PostInfo />
            <PostContent />
            <PostTagsSection />
            {!showRestrictedView && <PostChangelog />}
            {!showRestrictedView && <PostPartsSection />}
            {showCreatorSupport && (
              <div className="md:hidden">
                <CreatorSupportCard />
              </div>
            )}
            {!showRestrictedView && (
              <EngagementPromptBlock
                onAnswerPrompt={showComments ? setSelectedPrompt : undefined}
                prompts={post.engagementPrompts}
              />
            )}
            {showComments && (
              <CommentSection
                onSelectedPromptChange={setSelectedPrompt}
                selectedPrompt={selectedPrompt}
              />
            )}
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
          <div className="flex flex-col gap-4">
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
  const statusName = post.terms?.find(
    (term) => term.taxonomy === "status"
  )?.name;
  const versionBadgeClassName = getVersionBadgeClassName(statusName);
  const mainImage = getCoverImageObjectKey(
    post.imageObjectKeys,
    post.coverImageObjectKey
  );

  return (
    <div className="relative">
      {mainImage ? (
        <div className="relative overflow-hidden rounded-xl bg-muted">
          <img
            alt={`Portada de ${post.title}`}
            className="block h-auto w-full"
            src={getBucketUrl(mainImage)}
          />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 md:p-10">
            <h1 className="mb-2 font-[Lexend] font-bold text-white text-xl drop-shadow-lg md:text-4xl">
              {post.title}
            </h1>
            <div className="py-2 text-sm">
              {post.version && (
                <Badge className={versionBadgeClassName}>{post.version}</Badge>
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
            {post.version && (
              <Badge className={versionBadgeClassName}>{post.version}</Badge>
            )}
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
  const navigate = useNavigate();

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      trackEvent("share_link_copied", {
        contentId: post.id,
        contentType: post.type,
        source: "post_stats_bar",
      });
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const handleRandom = async () => {
    const result = await orpcClient.post.getRandom({ type: post.type });
    if (!result) {
      return;
    }

    if (post.type === "comic") {
      navigate({ params: { slug: result.slug }, to: "/comic/$slug" });
      return;
    }

    navigate({ params: { id: result.slug }, to: "/post/$id" });
  };

  const createdAt = format(post.createdAt, "PP", { locale: es });
  const updatedAt = format(post.updatedAt, "PP", { locale: es });
  const showRating =
    !post.earlyAccess.isActive &&
    post.ratingCount !== undefined &&
    post.ratingCount > 0;

  return (
    <section className="px-4 pt-4">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-md backdrop-blur-sm">
        {/* Top row: stats cluster (left) + rating CTA (right) */}
        <div className="flex flex-col gap-5 p-3 md:flex-row md:items-stretch md:justify-between md:gap-4 md:pl-8">
          <div className="flex flex-wrap items-center justify-evenly gap-x-4 gap-y-3 px-4 md:justify-start md:gap-x-8 md:px-1">
            <StatCell
              icon={ViewIcon}
              label="Vistas"
              value={String(post.views)}
            />
            <StatDivider />
            <StatCell
              icon={FavouriteIcon}
              iconClassName="text-rose-400"
              label="Me gusta"
              value={String(post.likes)}
            />
            {showRating && (
              <>
                <StatDivider />
                <StatCell
                  icon={StarIcon}
                  iconClassName="fill-amber-300 text-amber-300"
                  label="Rating"
                  value={`${(post.averageRating ?? 0).toFixed(1)}/10`}
                  valueClassName="text-amber-100"
                />
              </>
            )}
            <StatDivider />
            <StatCell
              icon={Clock01Icon}
              label={createdAt === updatedAt ? "Publicado" : "Actualizado"}
              value={updatedAt}
            />
          </div>

          {!post.earlyAccess.isActive && (
            <Link
              className="group relative flex items-center gap-3 rounded-xl border border-amber-400/40 bg-linear-to-r from-amber-400/10 via-amber-400/6 to-transparent px-4 py-3 shadow-glow-amber-400/10 transition-[background-color,border-color,box-shadow] duration-200 hover:border-amber-400/65 hover:bg-amber-400/15 hover:shadow-glow-amber-400/35 md:shrink-0"
              params={{ id: post.id }}
              to="/post/reviews/$id"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-amber-400/55 bg-amber-400/15">
                <HugeiconsIcon
                  className="size-4 fill-amber-300 text-amber-300"
                  icon={StarIcon}
                />
              </div>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="font-semibold text-[13px] text-amber-50">
                  Deja tu Opinión
                </span>
                <span className="text-[11.5px] tabular-nums text-amber-200/75">
                  <RatingDisplay
                    averageRating={post.averageRating ?? 0}
                    ratingCount={post.ratingCount}
                    variant="compact"
                  />
                </span>
              </div>
              <HugeiconsIcon
                className="ml-1 size-3.5 text-amber-200/50 transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-amber-200"
                icon={ArrowRight01Icon}
              />
            </Link>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-border/60" />

        {/* Action buttons row */}
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-5">
          <LikeButton postId={post.id} />
          <BookmarkButton postId={post.id} />
          <FollowButton contentId={post.id} />
          <Tooltip>
            <TooltipTrigger
              onClick={handleShare}
              render={<PostActionButton tone="purple" />}
            >
              <HugeiconsIcon className="size-4" icon={Share08Icon} />
              Compartir
            </TooltipTrigger>
            <TooltipContent>Copiar enlace al portapapeles</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              onClick={handleRandom}
              render={
                <Button
                  className="h-11 rounded-xl border-white/15 bg-background/60 px-3"
                  type="button"
                  variant="outline"
                />
              }
              title={
                post.type === "comic" ? "Cómic aleatorio" : "Juego aleatorio"
              }
            >
              <HugeiconsIcon className="size-4" icon={ShuffleSquareIcon} />
              Aleatorio
            </TooltipTrigger>
            <TooltipContent>
              {post.type === "comic" ? "Comic aleatorio" : "Juego aleatorio"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </section>
  );
}

function StatCell({
  icon,
  value,
  label,
  iconClassName,
  valueClassName,
}: {
  icon: IconSvgElement;
  value: string;
  label: string;
  iconClassName?: string;
  valueClassName?: string;
}) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5 leading-none">
      <span className="inline-flex items-center gap-1.5">
        <HugeiconsIcon
          className={cn("size-3.5 text-muted-foreground", iconClassName)}
          icon={icon}
        />
        <span
          className={cn(
            "whitespace-nowrap font-semibold text-foreground text-[15px] tabular-nums",
            valueClassName
          )}
        >
          {value}
        </span>
      </span>
      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
        {label}
      </span>
    </span>
  );
}

function StatDivider() {
  return (
    <span
      aria-hidden="true"
      className="w-px shrink-0 self-stretch select-none bg-border/70 md:-my-3"
    />
  );
}

export function PostActionBar() {
  const post = usePost();

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      trackEvent("share_link_copied", {
        contentId: post.id,
        contentType: post.type,
        source: "post_action_bar",
      });
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

  const parts = [
    { suffix: "d", value: countdown.days },
    { suffix: "h", value: countdown.hours },
    { suffix: "m", value: countdown.minutes },
    { suffix: "s", value: countdown.seconds },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
        <HugeiconsIcon className="size-3" icon={Clock01Icon} />
        {label}
      </span>
      <div className="flex items-baseline gap-1 font-mono">
        {parts.map((part, index) => (
          <span className="inline-flex items-baseline" key={part.suffix}>
            {index > 0 && (
              <span className="mr-1 text-muted-foreground/30">·</span>
            )}
            <span className="font-bold text-lg leading-none text-foreground">
              {String(part.value).padStart(2, "0")}
            </span>
            <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
              {part.suffix}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function formatPhaseLabel(post: PostProps): string {
  if (post.earlyAccess.currentState === "VIP12_ONLY") {
    return "Solo VIP 12";
  }

  if (post.earlyAccess.currentState === "VIP8_ONLY") {
    return "Desde VIP 8";
  }

  return "Acceso anticipado";
}

function EarlyAccessStatusBanner() {
  const post = usePost();

  if (!post.earlyAccess.isActive) {
    return null;
  }

  return (
    <section className="px-4 pt-4">
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-card/70 shadow-md backdrop-blur-sm">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-amber-300 via-amber-400 to-amber-500"
        />
        <div className="flex flex-col gap-4 p-4 pl-5 md:flex-row md:items-center md:justify-between md:gap-8 md:pl-6">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1.5 border-amber-400/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/15">
                <HugeiconsIcon
                  className="size-3 fill-amber-300 text-amber-300"
                  icon={StarIcon}
                />
                {formatPhaseLabel(post)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                Lanzamiento por fases
              </span>
            </div>
            <p className="max-w-xl text-foreground/85 text-sm leading-relaxed">
              {post.earlyAccess.viewerCanAccess
                ? "Tu nivel ya entra en esta fase. Disfrútalo antes que el resto."
                : "Las cuentas VIP juegan primero. Al terminar la cuenta atrás, el post queda libre para todos."}
            </p>
          </div>
          <div className="grid grid-cols-2 items-stretch gap-4 md:gap-6">
            <CountdownCluster
              label="Próxima fase"
              targetAt={post.earlyAccess.currentPhaseEndsAt}
            />
            <CountdownCluster
              label="Público total"
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

  const tierLabel = post.earlyAccess.requiredTierLabel ?? "VIP";

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-card/60 p-4 shadow-md backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-amber-400/55 bg-amber-400/15">
          <HugeiconsIcon
            className="size-4 fill-amber-300 text-amber-300"
            icon={StarIcon}
          />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-200/75">
            Acceso anticipado
          </span>
          <span className="truncate font-semibold text-foreground text-sm">
            {post.earlyAccess.viewerCanAccess
              ? "Acceso concedido"
              : `Pide ${tierLabel}`}
          </span>
        </div>
      </div>
      <div className="mt-4 border-border/60 border-t pt-3">
        <CountdownCluster
          label="Libre para todos en"
          targetAt={post.earlyAccess.publicReleaseAt}
        />
      </div>
    </div>
  );
}

function EarlyAccessDownloadGate() {
  const post = usePost();
  const { data: session } = authClient.useSession();

  if (!post.earlyAccess.isActive) {
    return null;
  }

  const tierLabel = post.earlyAccess.requiredTierLabel ?? "VIP";
  const upgradeLink = session?.session ? (
    <Link to="/profile" />
  ) : (
    <Link to="/auth" />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Descargas</div>
      <div className="flex flex-col items-center gap-5 rounded-md bg-linear-to-br from-amber-400/20 via-amber-400/10 to-transparent p-6 ring-1 shadow-glow-amber-400/20 ring-amber-400/40 md:p-10">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-amber-400/55 bg-amber-400/15">
          <HugeiconsIcon
            className="size-8 fill-amber-300 text-amber-300"
            icon={StarIcon}
          />
        </div>

        <div className="flex max-w-lg flex-col items-center gap-2 text-center">
          <h3 className="font-[Lexend] font-bold text-amber-50 text-xl md:text-2xl">
            Descarga reservada a {tierLabel}
          </h3>
          <p className="text-amber-100/80 text-sm leading-relaxed">
            Puedes ver capturas, sinopsis y comentarios. El archivo abre por
            niveles — sube a {tierLabel} para descargar ya, o espera al cierre
            de la cuenta atrás.
          </p>
        </div>

        <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2">
          <CountdownCluster
            label="Próxima fase"
            targetAt={post.earlyAccess.currentPhaseEndsAt}
          />
          <CountdownCluster
            label="Público total"
            targetAt={post.earlyAccess.publicReleaseAt}
          />
        </div>

        <PostActionButton
          className="group w-auto pl-7"
          nativeButton={false}
          render={upgradeLink}
          tone="amber"
        >
          <HugeiconsIcon
            className="size-4 fill-amber-300 text-amber-300"
            icon={StarIcon}
          />
          Ver planes VIP
          <HugeiconsIcon
            className="ml-1 size-3.5 text-amber-200/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-amber-200"
            icon={ArrowRight01Icon}
          />
        </PostActionButton>
      </div>
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
          <TagCategory label="Estilo" terms={groupedTerms.style} />
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
      <TranslatorSupportCard />

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

  const allImages = getGalleryImageObjectKeys(
    post.imageObjectKeys,
    post.coverImageObjectKey
  );
  const galleryImages = allImages.map((key, index) => ({
    alt: `${post.title} - Imagen ${index + 1}`,
    src: getBucketUrl(key),
  }));
  const hasImages = allImages.length > 0;

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
        <div className="section-title">Acerca De</div>
        <Card>
          <CardContent>
            <Markdown>{post.content}</Markdown>
          </CardContent>
        </Card>
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
  const [tab, setTab] = useState<"downloads" | "premium">(
    hasPremium && post.premiumLinksAccess.status === "granted"
      ? "premium"
      : "downloads"
  );

  if (!(hasDownloadLinks || hasChangelog || hasPremium)) {
    return null;
  }

  if (post.earlyAccess.isActive && !post.earlyAccess.viewerCanAccess) {
    return hasAnyDownloadSurface ? <EarlyAccessDownloadGate /> : null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Descargas</div>
      <Card className="pb-6">
        <Tabs className="w-full gap-6" onValueChange={setTab} value={tab}>
          <CardHeader>
            <TabsPrimitive.List className="w-full inline-flex gap-4 items-center justify-center">
              {hasDownloadLinks && (
                <TabsPrimitive.Tab
                  className="gap-2 flex-1"
                  value="downloads"
                  render={
                    <PostActionButton
                      tone="purple"
                      active={tab === "downloads"}
                    />
                  }
                >
                  <HugeiconsIcon className="size-4" icon={Download04Icon} />
                  Anuncios
                </TabsPrimitive.Tab>
              )}
              {hasPremium && (
                <TabsPrimitive.Tab
                  className="gap-2 flex-1"
                  value="premium"
                  render={
                    <PostActionButton tone="amber" active={tab === "premium"} />
                  }
                >
                  <HugeiconsIcon className="size-4" icon={StarIcon} />
                  VIP
                </TabsPrimitive.Tab>
              )}
            </TabsPrimitive.List>
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
  const [isExpanded, setIsExpanded] = useState(false);

  if (!post.changelog) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Registro de Cambios</div>
      <div className="border border-border bg-card p-4 rounded-xl">
        {isExpanded ? (
          <>
            <Markdown>{post.changelog}</Markdown>
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => {
                  setIsExpanded(false);
                }}
                type="button"
                variant="outline"
              >
                Ver menos
              </Button>
            </div>
          </>
        ) : (
          <div className="flex justify-center">
            <Button
              onClick={() => {
                setIsExpanded(true);
              }}
              type="button"
              variant="outline"
            >
              Ver Cambios
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PostPartsSection() {
  const post = usePost();
  const [isExpanded, setIsExpanded] = useState(false);
  const parts = post.seriesParts ?? [];

  if (parts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Partes</div>
      <div className="border border-border bg-card p-4 rounded-xl">
        {isExpanded ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
              {parts.map((item) => (
                <PostCard key={item.id} post={item} />
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => {
                  setIsExpanded(false);
                }}
                type="button"
                variant="outline"
              >
                Ver menos
              </Button>
            </div>
          </>
        ) : (
          <div className="flex justify-center">
            <Button
              onClick={() => {
                setIsExpanded(true);
              }}
              type="button"
              variant="outline"
            >
              Ver Partes
            </Button>
          </div>
        )}
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
    <div className="flex flex-col items-center justify-center gap-4 rounded-md ring-1 ring-primary shadow-glow-primary/20 bg-linear-to-br from-amber-400/20 via-amber-400/10 to-transparent py-16">
      <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-amber-400/55 bg-amber-400/15">
        <HugeiconsIcon
          className="size-8 fill-amber-300 text-amber-300"
          icon={StarIcon}
        />
      </div>
      <section className="text-center text-amber-50">
        <p className="text-base">
          Necesitas VIP {descriptor.requiredTierLabel} o superior para acceder a
          estos enlaces
        </p>
        {!(
          descriptor.isManualAccessLevel ||
          descriptor.requiredTierLabel === "LvL 5"
        ) && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <span
              aria-hidden
              className="inline-flex size-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_2px] shadow-amber-300/60"
            />
            <p>VIP LvL 5 o superior también funcionan!</p>
          </div>
        )}
      </section>
      <PostActionButton
        tone="amber"
        render={<Link to="/memberships" />}
        className="w-auto pl-7"
      >
        Comparar Rangos
        <HugeiconsIcon
          className="ml-1 size-3.5 text-amber-200/50 transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-amber-200"
          icon={ArrowRight01Icon}
        />
      </PostActionButton>
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
                loading="lazy"
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

  if (post.type === "comic" && post.creatorId) {
    return (
      <Link
        className="group relative block animate-scale-pulse overflow-hidden rounded-full bg-linear-to-br from-secondary/30 to-transparent ring-1 ring-secondary shadow-glow-secondary/30 transition-all hover:scale-105 hover:shadow-glow-secondary/50"
        params={{ id: post.creatorId }}
        to="/comic-creator/$id"
      >
        <CreatorSupportContent />
      </Link>
    );
  }

  const Comp = post.creatorLink ? "a" : "div";
  return (
    <Comp
      className="group relative block overflow-hidden animate-scale-pulse ring-1 ring-secondary shadow-glow-secondary/30 transition-all hover:scale-105 rounded-full bg-linear-to-br from-secondary/30 to-transparent hover:shadow-glow-secondary/50"
      href={post.creatorLink}
      rel="noopener"
      target="_blank"
    >
      <CreatorSupportContent />
    </Comp>
  );
}

function CreatorSupportContent() {
  const post = usePost();
  const label = post.type === "comic" ? "Más del Autor" : "Apoya al Creador";

  return (
    <div className="relative flex items-center gap-4">
      {post.creatorAvatarObjectKey ? (
        <img
          alt={post.creatorName || "Avatar del creador"}
          className="aspect-square size-16 shrink-0"
          src={getBucketUrl(post.creatorAvatarObjectKey)}
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/20 via-secondary/20 to-accent/20">
          <HugeiconsIcon
            className="size-10 text-primary"
            icon={FavouriteCircleIcon}
          />
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <span className="font-[Lexend] font-bold uppercase">{label}</span>
        {post.creatorName && (
          <span className="text-primary">{post.creatorName}</span>
        )}
      </div>
    </div>
  );
}

export function TranslatorSupportCard() {
  const post = usePost();
  const { translator } = post;
  const hasTranslator = translator !== null;
  if (post.earlyAccess.isRestrictedView || !hasTranslator) {
    return null;
  }

  return (
    <a
      className="group relative block overflow-hidden rounded-full bg-linear-to-br from-primary/25 to-transparent ring-1 ring-primary/60 transition-all hover:scale-105 hover:shadow-glow-primary/30"
      href={translator.url}
      rel="noopener"
      target="_blank"
    >
      <div className="relative flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/20 via-accent/20 to-secondary/20 font-[Lexend] font-bold text-primary">
          TR
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-[Lexend] font-bold uppercase">Traduccion</span>
          <span className="text-primary">{translator.name}</span>
        </div>
      </div>
    </a>
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
