import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bookmark,
  ChevronRight,
  CircleMinus,
  Crown,
  ExternalLink,
  Gem,
  Lock,
  Palette,
  Settings2,
  Shield,
  Sparkles,
  Sticker,
  Target,
  TrendingUp,
  Users,
  WandSparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultMembershipUpgradeConfig } from "@/features/vip-upgrade/config";
import {
  buildFeatureComparisons,
  getActiveBadgeStage,
  getBadgeProgressPercent,
  getNextBadgeStage,
  getRecommendedTierId,
  getSelectedSurveySummary,
  getTierById,
  resolveTierIdFromSource,
  sortTiers,
} from "@/features/vip-upgrade/engine";
import type {
  FeatureComparison,
  SurveyAnswers,
} from "@/features/vip-upgrade/engine";
import { membershipUpgradeConfigSchema } from "@/features/vip-upgrade/types";
import type {
  FeatureDiffStatus,
  FeatureValue,
  MembershipTier,
  MembershipUpgradeConfig,
  ThemePalette,
} from "@/features/vip-upgrade/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

const CONFIG_STORAGE_KEY = "nexustc.vip-upgrade-config";

const iconMap = {
  bookmark: Bookmark,
  crown: Crown,
  palette: Palette,
  shield: Shield,
  sparkles: Sparkles,
  stickers: Sticker,
  users: Users,
  bolt: Zap,
} as const;

function safeValidateConfig(rawInput: string) {
  try {
    return {
      data: membershipUpgradeConfigSchema.parse(
        JSON.parse(rawInput) as unknown
      ),
      success: true as const,
    };
  } catch {
    return { message: "Config invalida", success: false as const };
  }
}

function getMonthsSince(dateValue: Date | string | null | undefined): number {
  if (!dateValue) {
    return 0;
  }
  const startAt = new Date(dateValue);
  if (Number.isNaN(startAt.getTime())) {
    return 0;
  }
  return Math.max(
    0,
    (new Date().getFullYear() - startAt.getFullYear()) * 12 +
      (new Date().getMonth() - startAt.getMonth())
  );
}

function formatCounterValue(value: number, suffix?: string): string {
  const displayValue = value >= 999 ? "∞" : value.toString();
  return suffix ? `${displayValue} ${suffix}` : displayValue;
}

function getDefaultPaletteId(tier: MembershipTier): string | null {
  const themeValue = tier.featureValues["theme-remix"];
  return themeValue?.kind === "palette"
    ? (themeValue.palettes[0]?.id ?? null)
    : null;
}

function getPaletteById(
  tier: MembershipTier,
  paletteId: string | null
): ThemePalette | null {
  const themeValue = tier.featureValues["theme-remix"];
  if (themeValue?.kind !== "palette") {
    return null;
  }
  return (
    themeValue.palettes.find((palette) => palette.id === paletteId) ??
    themeValue.palettes[0] ??
    null
  );
}

export function MembershipUpgradeExperience() {
  const auth = authClient.useSession();
  const isMobile = useIsMobile();
  const { data: patronStatus } = useQuery({
    ...orpc.patreon.getStatus.queryOptions(),
    enabled: Boolean(auth.data?.user),
  });
  const [config, setConfig] = useState<MembershipUpgradeConfig>(
    defaultMembershipUpgradeConfig
  );
  const [editorInput, setEditorInput] = useState(() =>
    JSON.stringify(defaultMembershipUpgradeConfig, null, 2)
  );
  const deferredEditorInput = useDeferredValue(editorInput);
  const editorValidation = safeValidateConfig(deferredEditorInput);
  const [currentTierId, setCurrentTierId] = useState(
    defaultMembershipUpgradeConfig.comparisonDefaults.currentTierId
  );
  const [targetTierId, setTargetTierId] = useState(
    defaultMembershipUpgradeConfig.comparisonDefaults.targetTierId
  );
  const [featureTab, setFeatureTab] = useState<FeatureDiffStatus>(
    defaultMembershipUpgradeConfig.comparisonDefaults.featureTab
  );
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [activePaletteId, setActivePaletteId] = useState<string | null>(
    getDefaultPaletteId(
      getTierById(
        defaultMembershipUpgradeConfig,
        defaultMembershipUpgradeConfig.comparisonDefaults.targetTierId
      )
    )
  );
  const [ctaTouched, setCtaTouched] = useState(false);
  const sessionTierAppliedRef = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!saved) {
      return;
    }
    const parsed = safeValidateConfig(saved);
    if (!parsed.success) {
      return;
    }
    setConfig(parsed.data);
    setEditorInput(JSON.stringify(parsed.data, null, 2));
    setCurrentTierId(parsed.data.comparisonDefaults.currentTierId);
    setTargetTierId(parsed.data.comparisonDefaults.targetTierId);
    setFeatureTab(parsed.data.comparisonDefaults.featureTab);
  }, []);

  useEffect(() => {
    if (sessionTierAppliedRef.current || !patronStatus?.tier) {
      return;
    }
    const resolvedTierId = resolveTierIdFromSource(config, patronStatus.tier);
    if (resolvedTierId) {
      setCurrentTierId(resolvedTierId);
      setTargetTierId(getRecommendedTierId(config, answers, resolvedTierId));
    }
    sessionTierAppliedRef.current = true;
  }, [answers, config, patronStatus?.tier]);

  const tiers = sortTiers(config);
  const currentTier = getTierById(config, currentTierId);
  const recommendedTier = getTierById(
    config,
    getRecommendedTierId(config, answers, currentTierId)
  );
  const targetTier = getTierById(
    config,
    tiers.some((tier) => tier.id === targetTierId)
      ? targetTierId
      : recommendedTier.id
  );
  const activePalette =
    getPaletteById(targetTier, activePaletteId) ??
    getPaletteById(targetTier, getDefaultPaletteId(targetTier));
  const comparisons = buildFeatureComparisons(config, currentTier, targetTier);
  const counts = {
    missing: comparisons.filter((item) => item.status === "missing").length,
    shared: comparisons.filter((item) => item.status === "shared").length,
    unlocked: comparisons.filter((item) => item.status === "unlocked").length,
  };
  const visibleComparisons = comparisons.filter(
    (item) => item.status === featureTab
  );
  const currentMonths =
    patronStatus?.isPatron && patronStatus.patronSince
      ? getMonthsSince(patronStatus.patronSince)
      : currentTier.badgeEvolution.previewMonths;
  const targetMonths = Math.max(
    currentMonths + Math.max(0, targetTier.order - currentTier.order),
    targetTier.badgeEvolution.previewMonths
  );
  const surfaceStyle = {
    backgroundImage: activePalette?.gradient,
  } satisfies CSSProperties;
  const ctaTier =
    targetTier.order > currentTier.order ? targetTier : recommendedTier;
  const ctaLabel =
    targetTier.order > currentTier.order
      ? targetTier.ctaLabel
      : `Ir a ${recommendedTier.name}`;
  const canEditConfig =
    import.meta.env.DEV ||
    auth.data?.user.role === "admin" ||
    auth.data?.user.role === "owner";

  useEffect(() => {
    const palette = getPaletteById(targetTier, activePaletteId);
    if (!palette) {
      setActivePaletteId(getDefaultPaletteId(targetTier));
    }
  }, [activePaletteId, targetTier]);

  useEffect(() => {
    if (
      !(ctaTier.order > currentTier.order && counts.unlocked > 0 && !ctaTouched)
    ) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [counts.unlocked, ctaTier.order, ctaTouched, currentTier.order]);
  const onCurrentTierChange = (nextTierId: string | null) => {
    if (!nextTierId) {
      return;
    }
    startTransition(() => {
      setCurrentTierId(nextTierId);
      setTargetTierId(getRecommendedTierId(config, answers, nextTierId));
      setCtaTouched(false);
    });
  };
  const onTargetTierChange = (nextTierId: string | null) => {
    if (!nextTierId) {
      return;
    }
    startTransition(() => {
      setTargetTierId(nextTierId);
      setActivePaletteId(getDefaultPaletteId(getTierById(config, nextTierId)));
      setCtaTouched(false);
    });
  };
  const applyEditorConfig = () => {
    if (!editorValidation.success) {
      toast.error(
        "message" in editorValidation
          ? editorValidation.message
          : "Config invalida"
      );
      return;
    }
    setConfig(editorValidation.data);
    setCurrentTierId(editorValidation.data.comparisonDefaults.currentTierId);
    setTargetTierId(editorValidation.data.comparisonDefaults.targetTierId);
    setFeatureTab(editorValidation.data.comparisonDefaults.featureTab);
    setActivePaletteId(
      getDefaultPaletteId(
        getTierById(
          editorValidation.data,
          editorValidation.data.comparisonDefaults.targetTierId
        )
      )
    );
    window.localStorage.setItem(
      CONFIG_STORAGE_KEY,
      JSON.stringify(editorValidation.data)
    );
    toast.success("Motor VIP actualizado");
  };
  const resetEditorConfig = () => {
    const serialized = JSON.stringify(defaultMembershipUpgradeConfig, null, 2);
    setConfig(defaultMembershipUpgradeConfig);
    setEditorInput(serialized);
    setCurrentTierId(
      defaultMembershipUpgradeConfig.comparisonDefaults.currentTierId
    );
    setTargetTierId(
      defaultMembershipUpgradeConfig.comparisonDefaults.targetTierId
    );
    setFeatureTab(defaultMembershipUpgradeConfig.comparisonDefaults.featureTab);
    setActivePaletteId(
      getDefaultPaletteId(
        getTierById(
          defaultMembershipUpgradeConfig,
          defaultMembershipUpgradeConfig.comparisonDefaults.targetTierId
        )
      )
    );
    window.localStorage.removeItem(CONFIG_STORAGE_KEY);
    toast.success("Config por defecto restaurada");
  };
  return (
    <section
      className="membership-engine relative overflow-hidden rounded-[36px] border border-white/10 p-4 md:p-6"
      style={surfaceStyle}
    >
      <div className="membership-noise pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative z-10 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/22 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-white/72">
              <Target className="size-3.5" />
              {config.hero.eyebrow}
            </div>
            <h1 className="font-[Lexend] text-4xl text-white leading-[1.02] md:text-5xl">
              {config.hero.title}
            </h1>
            <p className="max-w-2xl text-sm text-white/72 leading-relaxed md:text-base">
              {config.hero.subtitle}
            </p>
          </div>
          {canEditConfig ? (
            <Drawer>
              <DrawerTrigger className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-black/22 px-3 py-2 text-sm text-white transition-colors hover:bg-black/32">
                <Settings2 className="size-4" />
                {config.editorLabel}
              </DrawerTrigger>
              <DrawerContent className="border-white/10 bg-slate-950 text-white">
                <DrawerHeader>
                  <DrawerTitle>{config.editorLabel}</DrawerTitle>
                  <DrawerDescription className="text-white/60">
                    Controla tiers, precios, assets, URLs y pesos sin tocar la
                    lógica.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="px-4">
                  <Textarea
                    className="min-h-[52vh] rounded-[24px] border-white/12 bg-black/30 font-mono text-xs text-white"
                    onChange={(event) => setEditorInput(event.target.value)}
                    value={editorInput}
                  />
                </div>
                <DrawerFooter className="sm:flex-row">
                  <Button onClick={applyEditorConfig}>Aplicar</Button>
                  <Button onClick={resetEditorConfig} variant="ghost">
                    Restablecer
                  </Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          ) : null}
        </header>

        <div className="sticky top-2 z-20 rounded-[28px] border border-white/10 bg-black/28 p-3 backdrop-blur-md xl:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="font-[Lexend] text-white">
              {currentTier.shortName}
              <ChevronRight className="mx-1 inline size-4 text-white/40" />
              <span className="text-cyan-200">{targetTier.shortName}</span>
            </div>
            <Badge className="bg-cyan-300/16 text-cyan-100">
              +{counts.unlocked} desbloqueos
            </Badge>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.86fr)]">
          <div className="space-y-5">
            <ComparisonControls
              answers={answers}
              counts={counts}
              config={config}
              currentTierId={currentTierId}
              featureTab={featureTab}
              onCurrentTierChange={onCurrentTierChange}
              onFeatureTabChange={setFeatureTab}
              onTargetTierChange={onTargetTierChange}
              recommendedTier={recommendedTier}
              setAnswers={setAnswers}
              setCtaTouched={setCtaTouched}
              targetTier={targetTier}
              tiers={tiers}
            />
            <FeatureGallery
              comparisons={visibleComparisons}
              currentTier={currentTier}
              targetTier={targetTier}
            />
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <TierPreviewCard
                label="Ahora"
                monthsActive={currentMonths}
                palette={getPaletteById(
                  currentTier,
                  getDefaultPaletteId(currentTier)
                )}
                tier={currentTier}
              />
              <TierPreviewCard
                label="Después"
                monthsActive={targetMonths}
                palette={activePalette}
                tier={targetTier}
              />
            </div>
            <Card className="rounded-[32px] border-white/10 bg-black/24">
              <CardContent className="space-y-5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-[Lexend] text-2xl text-white">
                    {ctaTier.name}
                  </div>
                  <Badge className="bg-pink-300/14 text-pink-100">
                    {counts.unlocked} upgrades
                  </Badge>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm text-white/72">
                  {ctaTier.order > currentTier.order
                    ? `Si sales ahora, sigues en ${currentTier.name} con ${counts.unlocked} mejoras sin activar.`
                    : `El motor sigue apuntando a ${recommendedTier.name} para reducir la brecha.`}
                </div>
                <Button
                  className="h-12 rounded-[22px] bg-linear-to-r from-cyan-300 via-sky-400 to-pink-400 font-semibold text-slate-950 shadow-[0_20px_44px_-26px_rgba(56,189,248,0.95)]"
                  onClick={() => setCtaTouched(true)}
                  render={
                    <a
                      aria-label={ctaLabel}
                      href={ctaTier.patronUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                >
                  {ctaLabel}
                  <ExternalLink className="size-4" />
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>

        {isMobile ? (
          <div className="sticky bottom-3 z-20 xl:hidden">
            <Button
              className="h-12 w-full rounded-[22px] bg-linear-to-r from-cyan-300 via-sky-400 to-pink-400 font-semibold text-slate-950 shadow-[0_20px_44px_-26px_rgba(56,189,248,0.95)]"
              onClick={() => setCtaTouched(true)}
              render={
                <a
                  aria-label={ctaLabel}
                  href={ctaTier.patronUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              }
            >
              {ctaLabel}
              <ExternalLink className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getDiffTone(status: FeatureDiffStatus) {
  switch (status) {
    case "missing": {
      return "membership-missing-card border-white/8 bg-white/4 text-white/68";
    }
    case "shared": {
      return "border-white/12 bg-white/6 text-white/82";
    }
    case "unlocked": {
      return "membership-unlocked-card border-cyan-300/28 bg-cyan-300/8 text-white";
    }
    default: {
      return "border-white/12 bg-white/6 text-white/82";
    }
  }
}

function ComparisonControls({
  answers,
  config,
  counts,
  currentTierId,
  featureTab,
  onCurrentTierChange,
  onFeatureTabChange,
  onTargetTierChange,
  recommendedTier,
  setAnswers,
  setCtaTouched,
  targetTier,
  tiers,
}: {
  answers: SurveyAnswers;
  config: MembershipUpgradeConfig;
  counts: Record<FeatureDiffStatus, number>;
  currentTierId: string;
  featureTab: FeatureDiffStatus;
  onCurrentTierChange: (value: string | null) => void;
  onFeatureTabChange: (value: FeatureDiffStatus) => void;
  onTargetTierChange: (value: string | null) => void;
  recommendedTier: MembershipTier;
  setAnswers: (value: SurveyAnswers) => void;
  setCtaTouched: (value: boolean) => void;
  targetTier: MembershipTier;
  tiers: MembershipTier[];
}) {
  return (
    <>
      <Card className="rounded-[32px] border-white/10 bg-black/22">
        <CardContent className="grid gap-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TierSelect
              label="Tu nivel actual"
              onValueChange={onCurrentTierChange}
              tiers={tiers}
              value={currentTierId}
            />
            <TierSelect
              label="Nivel a comparar"
              onValueChange={onTargetTierChange}
              tiers={tiers}
              value={targetTier.id}
            />
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="flex snap-x gap-3">
              {tiers.map((tier) => (
                <button
                  className={cn(
                    "min-w-60 snap-start rounded-[28px] border px-4 py-4 text-left transition-all duration-300",
                    tier.id === targetTier.id
                      ? "ring-2 ring-white/24"
                      : "ring-1 ring-white/10",
                    tier.emphasis === "entry"
                      ? "opacity-80"
                      : tier.emphasis === "mid"
                        ? "scale-[1.01] shadow-[0_28px_80px_-60px_rgba(56,189,248,0.85)]"
                        : tier.emphasis === "premium"
                          ? "scale-[1.025] shadow-[0_34px_110px_-72px_rgba(244,114,182,0.9)]"
                          : "scale-[1.035] shadow-[0_36px_120px_-72px_rgba(250,204,21,0.95)]"
                  )}
                  key={tier.id}
                  onClick={() => onTargetTierChange(tier.id)}
                  style={{
                    backgroundImage: tier.visual.surface,
                    borderColor: tier.visual.border,
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/52">
                        {tier.eyebrow}
                      </div>
                      <div className="mt-2 font-[Lexend] text-2xl text-white">
                        {tier.name}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {tier.id === recommendedTier.id ? (
                        <Badge className="bg-cyan-300/16 text-cyan-100">
                          {tier.spotlightLabel ?? "Suggested"}
                        </Badge>
                      ) : null}
                      {tier.id === targetTier.id ? (
                        <Badge className="bg-pink-300/16 text-pink-100">
                          Objetivo
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">
                        {tier.priceLabel}
                      </div>
                      <div className="text-xs text-white/56">
                        {tier.billingLabel}
                      </div>
                    </div>
                    <div className="text-right text-xs text-white/56">
                      {tier.popularityNote}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border-white/10 bg-black/22">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/52">
                Smart recommendation
              </div>
              <div className="mt-2 font-[Lexend] text-2xl text-white">
                {recommendedTier.name}
              </div>
              <p className="mt-1 text-sm text-white/68">
                {config.recommendation.intro}
              </p>
            </div>
            <Badge className="bg-emerald-300/14 text-emerald-100">
              {recommendedTier.spotlightLabel ?? "Best fit"}
            </Badge>
          </div>
          <div className="grid gap-3">
            {config.recommendation.questions.map((question) => (
              <div className="space-y-3" key={question.id}>
                <div>
                  <div className="font-medium text-white">
                    {question.prompt}
                  </div>
                  {getSelectedSurveySummary(question, answers[question.id]) ? (
                    <div className="mt-1 text-xs text-white/56">
                      {getSelectedSurveySummary(question, answers[question.id])}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {question.options.map((option) => (
                    <button
                      className={cn(
                        "rounded-[22px] border px-3 py-3 text-left transition-all",
                        answers[question.id] === option.id
                          ? "border-cyan-300/40 bg-cyan-300/10 text-white shadow-[0_18px_40px_-26px_rgba(56,189,248,0.95)]"
                          : "border-white/10 bg-white/5 text-white/72 hover:border-white/18 hover:bg-white/8"
                      )}
                      key={option.id}
                      onClick={() => {
                        const nextAnswers = {
                          ...answers,
                          [question.id]: option.id,
                        };
                        startTransition(() => {
                          setAnswers(nextAnswers);
                          onTargetTierChange(
                            getRecommendedTierId(
                              config,
                              nextAnswers,
                              currentTierId
                            )
                          );
                          setCtaTouched(false);
                        });
                      }}
                      type="button"
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="mt-1 text-xs text-white/56">
                        {option.summary}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border-white/10 bg-black/22">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-[Lexend] text-2xl text-white">
              Lo que compartes vs lo que te falta
            </div>
            <Badge className="bg-white/10 text-white/72">
              {counts[featureTab]} visibles
            </Badge>
          </div>
          <Tabs
            onValueChange={(value) =>
              onFeatureTabChange(value as FeatureDiffStatus)
            }
            value={featureTab}
          >
            <TabsList className="w-full bg-white/8">
              <TabsTrigger value="unlocked">
                Nuevo {counts.unlocked}
              </TabsTrigger>
              <TabsTrigger value="shared">
                Compartido {counts.shared}
              </TabsTrigger>
              <TabsTrigger value="missing">
                Pierdes {counts.missing}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}

function FeatureGallery({
  comparisons,
  currentTier,
  targetTier,
}: {
  comparisons: FeatureComparison[];
  currentTier: MembershipTier;
  targetTier: MembershipTier;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <AnimatePresence initial={false} mode="popLayout">
        {comparisons.map((comparison) => (
          <FeatureCard
            comparison={comparison}
            currentTier={currentTier}
            key={`${comparison.definition.id}-${comparison.status}-${currentTier.id}-${targetTier.id}`}
            targetTier={targetTier}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function TierSelect({
  label,
  onValueChange,
  tiers,
  value,
}: {
  label: string;
  onValueChange: (value: string | null) => void;
  tiers: MembershipTier[];
  value: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/52">
        {label}
      </div>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger className="w-full rounded-[20px] border-white/12 bg-white/6 text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tiers.map((tier) => (
            <SelectItem key={tier.id} value={tier.id}>
              {tier.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TierPreviewCard({
  label,
  monthsActive,
  palette,
  tier,
}: {
  label: string;
  monthsActive: number;
  palette: ThemePalette | null;
  tier: MembershipTier;
}) {
  const badgeStage = getActiveBadgeStage(
    tier.badgeEvolution.stages,
    monthsActive
  );
  const nextBadge = getNextBadgeStage(tier.badgeEvolution.stages, monthsActive);
  const badgeProgress = getBadgeProgressPercent(
    tier.badgeEvolution.stages,
    monthsActive
  );
  const xpProgress = Math.min(100, (tier.xp.xp / tier.xp.nextLevelXp) * 100);

  return (
    <Card
      className="rounded-[32px] border-white/10 bg-black/24"
      style={{
        backgroundImage: tier.visual.surface,
        borderColor: tier.visual.border,
        boxShadow: `0 24px 80px -58px ${tier.visual.glow}`,
      }}
    >
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/52">
              {label}
            </div>
            <div className="mt-2 font-[Lexend] text-3xl text-white">
              {tier.name}
            </div>
            <div className="mt-1 text-sm text-white/68">{tier.tagline}</div>
          </div>
          <Badge className="bg-white/12 text-white">{tier.priceLabel}</Badge>
        </div>

        <div
          className="rounded-[24px] border border-white/12 bg-black/28 p-4"
          style={{ boxShadow: `0 0 42px ${tier.identity.glow}` }}
        >
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/44">
            Identity
          </div>
          <div
            className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: tier.identity.badgeAccent,
              color: "#020617",
            }}
          >
            <Crown className="size-3.5" />
            {tier.identity.badgeLabel}
          </div>
          <div
            className="mt-3 font-[Lexend] text-2xl"
            style={{
              backgroundImage: `linear-gradient(120deg,${tier.identity.gradient.join(",")})`,
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            {tier.identity.sampleName}
          </div>
          <div className="mt-1 text-sm text-white/62">
            {tier.identity.subtitle}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-white">
              <span style={{ color: badgeStage.accent }}>
                {badgeStage.emoji}
              </span>
              <span className="font-medium">{badgeStage.label}</span>
            </div>
            <Badge className="bg-white/10 text-white/72">
              {monthsActive} meses
            </Badge>
          </div>
          <Progress className="mt-4" value={badgeProgress}>
            <div className="w-full" />
          </Progress>
          <div className="mt-2 text-xs text-white/56">
            {nextBadge
              ? `Siguiente etapa: ${nextBadge.label} en ${nextBadge.monthsRequired - monthsActive} meses.`
              : "Evolución máxima alcanzada."}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-[Lexend] text-white">
              <TrendingUp className="size-4 text-cyan-200" />
              Nivel {tier.xp.level}
            </div>
            <Badge className="bg-cyan-300/12 text-cyan-100">
              +{tier.xp.monthlyBoost} XP/mes
            </Badge>
          </div>
          <Progress className="mt-4" value={xpProgress}>
            <div className="w-full" />
          </Progress>
          <div className="mt-2 text-xs text-white/56">
            {tier.xp.xp}/{tier.xp.nextLevelXp} XP
          </div>
        </div>

        {palette ? (
          <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/44">
              Theme live
            </div>
            <div className="mt-3 flex items-center gap-2">
              {palette.colors.map((color) => (
                <span
                  className="size-8 rounded-full border border-white/12"
                  key={color}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FeatureCard({
  comparison,
  currentTier,
  targetTier,
}: {
  comparison: FeatureComparison;
  currentTier: MembershipTier;
  targetTier: MembershipTier;
}) {
  const Icon =
    iconMap[comparison.definition.icon as keyof typeof iconMap] ?? WandSparkles;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={cn(
        "rounded-[26px] border p-4 backdrop-blur-sm",
        getDiffTone(comparison.status)
      )}
      exit={{
        opacity: 0,
        scale: 0.96,
        y: comparison.status === "missing" ? -8 : 12,
      }}
      initial={{
        opacity: 0,
        scale: 0.96,
        y: comparison.status === "unlocked" ? 18 : 8,
      }}
      layout={true}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-black/24">
            <Icon className="size-4" />
          </div>
          <div>
            <div className="font-medium text-white">
              {comparison.definition.label}
            </div>
            <div className="text-xs text-white/54">
              {comparison.definition.narrative}
            </div>
          </div>
        </div>
        <FeatureDeltaBadge status={comparison.status} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/42">
            {currentTier.shortName}
          </div>
          <FeatureVisual value={comparison.currentValue} />
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/24 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/42">
            {targetTier.shortName}
          </div>
          <FeatureVisual value={comparison.targetValue} />
        </div>
      </div>
    </motion.div>
  );
}

function FeatureDeltaBadge({ status }: { status: FeatureDiffStatus }) {
  if (status === "unlocked") {
    return (
      <Badge className="bg-cyan-300/16 text-cyan-100">
        <BadgeCheck className="size-3" />
        Nuevo
      </Badge>
    );
  }
  if (status === "missing") {
    return (
      <Badge className="bg-white/8 text-white/60">
        <Lock className="size-3" />
        Falta
      </Badge>
    );
  }
  return (
    <Badge className="bg-white/10 text-white/70">
      <CircleMinus className="size-3" />
      Compartido
    </Badge>
  );
}

function FeatureVisual({ value }: { value: FeatureValue | null }) {
  if (!value) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/42">
        <XCircle className="size-4" />
        No incluido
      </div>
    );
  }

  switch (value.kind) {
    case "ad-preview": {
      const slotIds = Array.from(
        { length: value.slots },
        (_slot, slotNumber) => `${value.placeholderLabel}-${slotNumber + 1}`
      );

      return (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm text-white/76">
            {value.adFree ? (
              <Shield className="size-4 text-emerald-200" />
            ) : (
              <Bookmark className="size-4 text-amber-200" />
            )}
            {value.adFree ? "Feed limpio" : value.placeholderLabel}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {slotIds.map((slotId) => (
              <div
                className={cn(
                  "h-10 rounded-2xl border border-dashed",
                  value.adFree
                    ? "border-emerald-300/22 bg-emerald-300/8"
                    : "border-amber-300/20 bg-amber-300/8"
                )}
                key={slotId}
              />
            ))}
          </div>
        </div>
      );
    }
    case "assets": {
      return (
        <div className="grid grid-cols-4 gap-2">
          {value.items.map((item) => (
            <div
              className="flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-lg"
              key={item.id}
              style={{
                boxShadow: item.accent
                  ? `0 0 30px -18px ${item.accent}`
                  : undefined,
              }}
              title={item.label}
            >
              {item.emoji ?? "*"}
            </div>
          ))}
        </div>
      );
    }
    case "boolean": {
      return (
        <div className="flex items-center gap-2 text-sm text-white/76">
          {value.enabled ? (
            <Gem className="size-4 text-cyan-200" />
          ) : (
            <Lock className="size-4 text-white/40" />
          )}
          {value.detail ?? (value.enabled ? "Activo" : "Bloqueado")}
        </div>
      );
    }
    case "counter": {
      return (
        <div className="space-y-2">
          <div className="font-[Lexend] text-2xl text-white">
            {formatCounterValue(value.value, value.suffix)}
          </div>
          <Progress
            value={Math.min(100, value.value >= 999 ? 100 : value.value * 2)}
          >
            <div className="w-full" />
          </Progress>
          {value.emphasis ? (
            <div className="text-xs text-white/54">{value.emphasis}</div>
          ) : null}
        </div>
      );
    }
    case "palette": {
      return (
        <div className="space-y-2">
          {value.palettes.slice(0, 2).map((palette) => (
            <div
              className="rounded-2xl border border-white/10 p-2"
              key={palette.id}
            >
              <div
                className="h-10 rounded-xl"
                style={{ backgroundImage: palette.gradient }}
              />
              <div className="mt-2 flex items-center gap-2">
                {palette.colors.map((color) => (
                  <span
                    className="size-4 rounded-full border border-white/12"
                    key={color}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "timeline": {
      return (
        <div className="space-y-2">
          {value.phases.map((phase) => (
            <div className="flex items-center gap-2" key={phase.label}>
              <span
                className="h-2 w-12 rounded-full"
                style={{ backgroundColor: phase.accent }}
              />
              <span className="text-sm text-white/74">{phase.label}</span>
              <span className="ml-auto text-xs text-white/42">
                {phase.hours}h
              </span>
            </div>
          ))}
        </div>
      );
    }
    default: {
      return null;
    }
  }
}
