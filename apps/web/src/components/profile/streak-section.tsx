"use client";

import { Fire03Icon } from "@hugeicons/core-free-icons";
import { Turnstile } from "@marsidev/react-turnstile";
import { env } from "@repo/env";
import { STREAK_CONTRIBUTION_MIN_LENGTH } from "@repo/shared/streak";
import type { StreakChallengeTarget } from "@repo/shared/streak";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { trackEvent, trackStreakDayCompletion } from "@/lib/analytics";
import { getClientErrorMessage, orpc, queryClient } from "@/lib/orpc";

const CHALLENGE_SOUND_KEY = "streak-challenge-sound";

export function StreakSection({
  streakPublic = false,
}: {
  streakPublic?: boolean;
}) {
  const { data } = useSuspenseQuery(orpc.streak.getMine.queryOptions());
  const [offerDismissed, setOfferDismissed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean | null>(null);
  const timezoneMutation = useMutation(
    orpc.streak.setTimezone.mutationOptions({
      onError: (error) =>
        toast.error(
          getClientErrorMessage(error, "No pudimos configurar tu zona horaria.")
        ),
      onSuccess: async () => {
        await queryClient.invalidateQueries(orpc.streak.getMine.queryOptions());
        toast.success("Zona horaria actualizada");
      },
    })
  );
  const challengeMutation = useMutation(
    orpc.streak.selectChallenge.mutationOptions({
      onError: (error) =>
        toast.error(
          getClientErrorMessage(error, "No pudimos guardar tu desaf\u00EDo.")
        ),
      onSuccess: async (_result, { target }) => {
        trackEvent("streak_challenge_selected", { target });
        await queryClient.invalidateQueries(orpc.streak.getMine.queryOptions());
        toast.success("Desaf\u00EDo de Racha elegido");
      },
    })
  );
  const stepUpMutation = useMutation(
    orpc.streak.completeStepUp.mutationOptions({
      onError: (error) => {
        const outcome =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "BAD_REQUEST"
            ? "fail"
            : "error";
        trackEvent("streak_step_up_completed", { outcome });
        toast.error(
          getClientErrorMessage(
            error,
            "No pudimos completar la verificación. Tu progreso sigue guardado."
          )
        );
      },
      onSuccess: async (result) => {
        const pendingXp = "pendingXp" in result && Boolean(result.pendingXp);
        const stepUpExpired =
          "stepUpExpired" in result && Boolean(result.stepUpExpired);
        trackEvent("streak_step_up_completed", { outcome: "pass" });
        trackStreakDayCompletion(result);
        await queryClient.invalidateQueries(orpc.streak.getMine.queryOptions());
        if (pendingXp) {
          toast.success("Día completado con XP pendientes de revisión");
        } else if (result.completed) {
          toast.success("Verificación completada");
        } else {
          toast.error(
            stepUpExpired
              ? "La actividad guardada venció. Puedes volver a completar tu Racha."
              : "No encontramos una actividad pendiente para verificar."
          );
        }
      },
    })
  );
  const visibilityMutation = useMutation(
    orpc.profile.updateVisibility.mutationOptions({
      onError: (error) =>
        toast.error(
          getClientErrorMessage(error, "No pudimos actualizar la privacidad.")
        ),
      onSuccess: async ({ visibility }) => {
        await queryClient.invalidateQueries(
          orpc.profile.getMySettings.queryOptions()
        );
        trackEvent("streak_visibility_changed", {
          public: visibility.streak,
        });
        toast.success("Privacidad de Racha actualizada");
      },
    })
  );

  useEffect(() => {
    try {
      setSoundEnabled(localStorage.getItem(CHALLENGE_SOUND_KEY) === "on");
    } catch {
      setSoundEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (
      !data.available ||
      !data.initialized ||
      !data.challenge.completed ||
      !data.challenge.completedAt ||
      !data.challenge.selectedAt ||
      !data.challenge.target ||
      soundEnabled === null
    ) {
      return;
    }
    const marker = `streak-challenge-completed:${data.challenge.selectedAt}`;
    try {
      if (localStorage.getItem(marker)) {
        return;
      }
      localStorage.setItem(marker, "seen");
    } catch {
      // Presentation state may fail closed without affecting the reward.
    }
    trackEvent("streak_challenge_completed", {
      outcome: data.challenge.completionOutcome ?? "immediate",
      target: data.challenge.target,
    });
    if (soundEnabled) {
      playCompletionSound();
    }
  }, [data, soundEnabled]);

  if (!data.available) {
    return null;
  }

  if (!data.initialized) {
    return (
      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description={
            "Tu zona horaria define el d\u00EDa local de tu Racha. No usamos la fecha ni la hora de tu dispositivo para otorgar XP."
          }
          eyebrow="Privado"
          icon={Fire03Icon}
          title="Racha"
        />
        <div className="mt-6 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
          <h3 className="font-semibold">Configura tu zona horaria</h3>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            Guardaremos el nombre IANA informado por tu navegador. Si no es
            v&aacute;lido, ninguna actividad contar&aacute; hasta que puedas
            seleccionarlo.
          </p>
          <Button
            className="mt-4"
            disabled={timezoneMutation.isPending}
            onClick={() => {
              const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
              if (!detected) {
                toast.error(
                  "Tu navegador no inform\u00F3 una zona horaria v\u00E1lida."
                );
                return;
              }
              timezoneMutation.mutate({ timezone: detected });
            }}
          >
            {timezoneMutation.isPending ? "Guardando" : "Usar mi zona horaria"}
          </Button>
        </div>
      </ProfilePanel>
    );
  }

  const displayTimezone =
    data.partialTimezoneDay && data.pendingTimezone
      ? data.pendingTimezone
      : data.timezone;
  const deadline = new Date(data.deadline).toLocaleString("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: displayTimezone,
  });
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const canChangeTimezone =
    detectedTimezone &&
    detectedTimezone !== data.timezone &&
    !data.pendingTimezone &&
    data.timezoneChangeAllowed;
  const readingProgress =
    data.partialTimezoneDay || data.protectedDay ? 0 : data.reading.progress;
  const contributionProgress =
    data.partialTimezoneDay || data.protectedDay
      ? 0
      : data.contribution.progress;
  const mixedDiscovery =
    data.partialTimezoneDay || data.protectedDay
      ? { discovery: 0, reading: 0 }
      : {
          discovery: data.mixedDiscovery.discovery.progress,
          reading: data.mixedDiscovery.reading.progress,
        };
  const selectChallenge = (target: StreakChallengeTarget) => {
    setOfferDismissed(true);
    challengeMutation.mutate({ target });
  };

  return (
    <ProfilePanel className="p-5 sm:p-6">
      <ProfileSectionHeader
        description={
          "Lee tres p\u00E1ginas verificadas, combina una lectura con dos acciones nuevas o publica una contribuci\u00F3n v\u00E1lida para completar tu d\u00EDa local."
        }
        eyebrow="Privado"
        icon={Fire03Icon}
        title="Racha"
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StreakStat
          label="Racha actual"
          value={`${data.currentStreak} d\u00EDas`}
        />
        <StreakStat
          label="Mejor racha"
          value={`${data.bestStreak} d\u00EDas`}
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
        <div>
          <p className="font-medium" id="streak-public-visibility-label">
            Mostrar mi Racha actual p&uacute;blicamente
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            Solo se mostrar&aacute; tu Racha actual. El resto de tu progreso
            sigue siendo privado.
          </p>
        </div>
        <Switch
          aria-labelledby="streak-public-visibility-label"
          checked={streakPublic}
          disabled={visibilityMutation.isPending}
          onCheckedChange={(checked) =>
            visibilityMutation.mutate({ streak: checked })
          }
        />
      </div>

      {data.stepUpRequired ? (
        <section
          aria-labelledby="streak-step-up-title"
          className="mt-5 rounded-[1.25rem] border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <h3 className="font-semibold" id="streak-step-up-title">
            Verifica tu actividad
          </h3>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            Tu actividad original se guardó. Necesitamos una verificación breve
            antes de acreditar este día de Racha; no tienes que repetir la
            acción.
          </p>
          <div className="mt-4">
            <Turnstile
              onError={() => {
                trackEvent("streak_step_up_completed", { outcome: "error" });
                toast.error(
                  "No pudimos cargar la verificación. Inténtalo nuevamente."
                );
              }}
              onSuccess={(token) => stepUpMutation.mutate({ token })}
              options={{
                action: "streak_step_up",
                size: "flexible",
                theme: "auto",
              }}
              siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            />
          </div>
          {stepUpMutation.isPending ? (
            <p className="mt-2 text-muted-foreground text-sm" role="status">
              Verificando…
            </p>
          ) : null}
        </section>
      ) : null}

      {data.pendingXp ? (
        <p
          className="mt-5 rounded-[1.25rem] border border-sky-500/30 bg-sky-500/5 p-4 text-sm leading-6"
          role="status"
        >
          El XP de este día de Racha está pendiente de revisión. Tu progreso ya
          fue guardado y no necesitas repetir la actividad.
        </p>
      ) : null}

      <section
        aria-labelledby="streak-challenge-title"
        className="mt-5 rounded-[1.25rem] border border-primary/25 bg-primary/5 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold" id="streak-challenge-title">
              Desaf&iacute;o de Racha
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Elige una meta una sola vez. El bonus se entrega
              autom&aacute;ticamente al alcanzarla.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span id="streak-challenge-sound-label">
              Sonido de celebraci&oacute;n
            </span>
            <Switch
              aria-labelledby="streak-challenge-sound-label"
              checked={soundEnabled ?? false}
              onCheckedChange={(checked) => {
                setSoundEnabled(checked);
                try {
                  localStorage.setItem(
                    CHALLENGE_SOUND_KEY,
                    checked ? "on" : "off"
                  );
                } catch {
                  // The toggle remains useful for this visit.
                }
              }}
            />
          </div>
        </div>

        {data.challenge.target ? (
          <div className="mt-4">
            <Progress
              aria-label={"Progreso del desaf\u00EDo de Racha"}
              value={Math.round(
                (data.challenge.completedDays / data.challenge.target) * 100
              )}
            >
              <ProgressLabel>
                Meta de {data.challenge.target} d&iacute;as
              </ProgressLabel>
              <span className="ml-auto text-muted-foreground text-sm tabular-nums">
                {data.challenge.completedDays}/{data.challenge.target}{" "}
                d&iacute;as
              </span>
            </Progress>
            <p className="mt-3 text-muted-foreground text-sm">
              {data.challenge.completed
                ? data.challenge.completionOutcome === "pending"
                  ? `${data.challenge.upcomingBonus} XP pendientes de revisi\u00F3n.`
                  : data.challenge.completionOutcome === "capped"
                    ? data.challenge.upcomingBonus
                      ? `Se sumaron ${data.challenge.upcomingBonus} XP; alcanzaste el m\u00E1ximo.`
                      : "No se sum\u00F3 XP porque alcanzaste el m\u00E1ximo."
                    : data.challenge.completionOutcome === "cancelled"
                      ? "El bonus fue cancelado durante la revisi\u00F3n."
                      : `Bonus recibido: ${data.challenge.upcomingBonus} XP.`
                : `${data.challenge.remainingDays} d\u00EDas restantes \u00B7 ${data.challenge.upcomingBonus} XP al completar.`}
            </p>
          </div>
        ) : data.challenge.availableTargets.length ? (
          <ChallengeChoices
            disabled={challengeMutation.isPending}
            onSelect={selectChallenge}
            targets={data.challenge.availableTargets}
          />
        ) : (
          <p className="mt-4 text-muted-foreground text-sm">
            Las nuevas metas aparecer&aacute;n al comenzar otra Racha.
          </p>
        )}

        {data.challenge.completed ? (
          <p
            aria-label={"Desaf\u00EDo de Racha completado"}
            className="mt-4 animate-pulse rounded-xl border border-primary/30 bg-primary/10 p-3 font-medium text-sm motion-reduce:animate-none"
            role="status"
          >
            {data.challenge.completionOutcome === "pending" ? (
              <>
                Desaf&iacute;o completado. Tu bonus est&aacute; en
                revisi&oacute;n como Pending XP.
              </>
            ) : data.challenge.completionOutcome === "capped" ? (
              data.challenge.upcomingBonus ? (
                <>
                  Desaf&iacute;o completado. Se sumaron{" "}
                  {data.challenge.upcomingBonus} XP; alcanzaste el
                  m&aacute;ximo.
                </>
              ) : (
                <>
                  Desaf&iacute;o completado. No se sum&oacute; XP porque
                  alcanzaste el m&aacute;ximo.
                </>
              )
            ) : data.challenge.completionOutcome === "cancelled" ? (
              <>
                Desaf&iacute;o completado. El bonus fue cancelado durante la
                revisi&oacute;n.
              </>
            ) : (
              <>
                &iexcl;Desaf&iacute;o completado! Tu bonus se acredit&oacute;
                sin necesidad de reclamarlo.
              </>
            )}
          </p>
        ) : null}
      </section>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setOfferDismissed(true);
          }
        }}
        open={data.challenge.offerAvailable && !offerDismissed}
      >
        <DialogContent
          className="motion-reduce:animate-none motion-reduce:transition-none"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Elige tu desaf&iacute;o de Racha</DialogTitle>
            <DialogDescription>
              Ya completaste tu primer d&iacute;a. Elige una meta permanente o
              vuelve cuando quieras desde Racha.
            </DialogDescription>
          </DialogHeader>
          <ChallengeChoices
            disabled={challengeMutation.isPending}
            onSelect={selectChallenge}
            targets={data.challenge.availableTargets}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Ahora no
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-5 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
        <Progress
          aria-label={"Progreso de lectura de hoy"}
          value={Math.round((readingProgress / data.reading.required) * 100)}
        >
          <ProgressLabel>Lectura de hoy</ProgressLabel>
          <span className="ml-auto text-muted-foreground text-sm tabular-nums">
            {readingProgress}/{data.reading.required}
          </span>
        </Progress>
        <p className="mt-3 text-muted-foreground text-sm">
          Lee tres p&aacute;ginas distintas con el lector verificado.
        </p>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
        <Progress
          aria-label={"Progreso de Descubrimiento mixto de hoy"}
          value={Math.round(
            ((mixedDiscovery.reading + mixedDiscovery.discovery) /
              (data.mixedDiscovery.reading.required +
                data.mixedDiscovery.discovery.required)) *
              100
          )}
        >
          <ProgressLabel>Descubrimiento mixto de hoy</ProgressLabel>
          <span className="ml-auto text-muted-foreground text-sm tabular-nums">
            Lectura {mixedDiscovery.reading}/
            {data.mixedDiscovery.reading.required} &middot; Acciones{" "}
            {mixedDiscovery.discovery}/{data.mixedDiscovery.discovery.required}
          </span>
        </Progress>
        <p className="mt-3 text-muted-foreground text-sm">
          Combina una p&aacute;gina verificada con dos favoritos, seguidos o
          valoraciones nuevas en contenidos distintos.
        </p>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
        <Progress
          aria-label={"Progreso de contribuci\u00F3n de hoy"}
          value={contributionProgress * 100}
        >
          <ProgressLabel>Contribuci&oacute;n de hoy</ProgressLabel>
          <span className="ml-auto text-muted-foreground text-sm tabular-nums">
            {contributionProgress}/{data.contribution.required}
          </span>
        </Progress>
        <p className="mt-3 text-muted-foreground text-sm">
          Publica un comentario nuevo de al menos{" "}
          {STREAK_CONTRIBUTION_MIN_LENGTH} caracteres normalizados.
        </p>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <StreakDetail label="Zona horaria guardada" value={data.timezone} />
        {data.pendingTimezone ? (
          <StreakDetail
            label="Pr\u00F3xima zona horaria"
            value={data.pendingTimezone}
          />
        ) : null}
        <StreakDetail label={"L\u00EDmite local"} value={deadline} />
        <StreakDetail label="XP de hoy" value={`${data.todayXp} XP`} />
        <StreakDetail
          label={"Pr\u00F3ximo nivel de recompensa"}
          value={`D\u00EDa ${data.upcomingReward.fromDay}: ${data.upcomingReward.xp} XP`}
        />
        {data.timezoneChangeEffectiveAt ? (
          <StreakDetail
            label="Cambio efectivo"
            value={new Date(data.timezoneChangeEffectiveAt).toLocaleString(
              "es",
              {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: data.pendingTimezone ?? data.timezone,
              }
            )}
          />
        ) : null}
        {data.timezoneChangeAvailableAt ? (
          <StreakDetail
            label="Pr\u00F3ximo cambio disponible"
            value={new Date(data.timezoneChangeAvailableAt).toLocaleString(
              "es",
              {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: data.timezone,
              }
            )}
          />
        ) : null}
      </dl>

      {detectedTimezone !== data.timezone && !data.pendingTimezone ? (
        <Button
          className="mt-5"
          disabled={!canChangeTimezone || timezoneMutation.isPending}
          onClick={() =>
            timezoneMutation.mutate({ timezone: detectedTimezone })
          }
          variant="outline"
        >
          {data.timezoneChangeAllowed
            ? `Cambiar a ${detectedTimezone}`
            : "Cambio de zona horaria en espera"}
        </Button>
      ) : null}

      {data.partialTimezoneDay ? (
        <p
          className="mt-5 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm"
          role="status"
        >
          El d&iacute;a parcial del cambio conserva tu continuidad, pero no
          admite progreso ni XP. Tu nueva zona comenzar&aacute; en el
          pr&oacute;ximo d&iacute;a completo.
        </p>
      ) : data.protectedDay ? (
        <p
          className="mt-5 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm"
          role="status"
        >
          Este es un d&iacute;a protegido: conserva tu continuidad sin progreso
          ni XP.
        </p>
      ) : data.atRisk ? (
        <p
          className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
          role="status"
        >
          Tu Racha est&aacute; en riesgo: completa una lectura, descubrimiento
          mixto o contribuci&oacute;n antes del l&iacute;mite local.
        </p>
      ) : null}
    </ProfilePanel>
  );
}

function ChallengeChoices({
  disabled,
  onSelect,
  targets,
}: {
  disabled: boolean;
  onSelect: (target: StreakChallengeTarget) => void;
  targets: readonly { target: StreakChallengeTarget; xp: number }[];
}) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {targets.map(({ target, xp }) => (
        <Button
          aria-label={`Elegir desaf\u00EDo de ${target} d\u00EDas por ${xp} XP`}
          disabled={disabled}
          key={target}
          onClick={() => onSelect(target)}
          type="button"
          variant="outline"
        >
          {target} d&iacute;as &middot; {xp} XP
        </Button>
      ))}
    </div>
  );
}

function playCompletionSound() {
  if (!window.AudioContext) {
    return;
  }
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.connect(context.destination);
    oscillator.frequency.value = 660;
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener("ended", () => context.close());
  } catch {
    // Optional feedback must never affect challenge presentation.
  }
}

function StreakStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-2 font-lexend font-semibold text-2xl tabular-nums">
        {value}
      </p>
    </div>
  );
}

function StreakDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/45 p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
