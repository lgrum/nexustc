import {
  BookOpenTextIcon,
  CheckListIcon,
  InformationCircleIcon,
  MessageSecure01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  RATING_REVIEW_MAX_LENGTH,
  RATING_REVIEW_MIN_LENGTH,
} from "@repo/shared/constants";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "NeXusTC - Guia de resenas",
};

const guidelineCards = [
  {
    description:
      "El 1 al 10 debe resumir tu experiencia real: calidad, estabilidad, contenido, ritmo y si lo recomendarias a otra persona.",
    icon: StarIcon,
    title: "Puntua con criterio",
  },
  {
    description:
      "Explica que te funciono y que no. Las resenas utiles hablan de escenas, mecanicas, traduccion, rendimiento o estado de una version.",
    icon: CheckListIcon,
    title: "Aporta contexto",
  },
  {
    description:
      "Evita revelar giros, finales o soluciones sin aviso. Si necesitas mencionar algo sensible, hazlo de forma general.",
    icon: MessageSecure01Icon,
    title: "Cuida los spoilers",
  },
] as const;

const allowedItems = [
  "Markdown basico para dar formato al texto.",
  "Opinion honesta sobre contenido, calidad tecnica y experiencia.",
  "Critica clara y respetuosa, incluso cuando la puntuacion sea baja.",
  `Resenas obligatorias de ${RATING_REVIEW_MIN_LENGTH} a ${RATING_REVIEW_MAX_LENGTH} caracteres para publicar una valoracion.`,
] as const;

const blockedItems = [
  "URLs, enlaces Markdown, imagenes embebidas o referencias externas.",
  "Insultos, ataques personales, acoso o contenido discriminatorio.",
  "Spam, autopromocion, copias repetidas o resenas sin relacion con el post.",
  "Datos privados, instrucciones para saltar pagos o contenido ilegal.",
] as const;

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 px-5 py-8 shadow-lg sm:px-8 md:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-linear-to-b from-amber-400/[0.14] via-primary/5 to-transparent"
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 font-semibold text-[11px] text-amber-200 uppercase tracking-[0.22em]">
              <HugeiconsIcon className="size-3.5" icon={BookOpenTextIcon} />
              Comunidad
            </div>
            <div className="space-y-3">
              <h1 className="display-heading text-balance text-[34px] leading-none sm:text-[44px]">
                Guia de resenas
              </h1>
              <p className="max-w-xl text-muted-foreground text-sm leading-relaxed sm:text-base">
                Las valoraciones ayudan a otros usuarios a decidir que leer o
                jugar. Buscamos resenas honestas, utiles y cuidadas, no notas
                impulsivas ni spoilers inesperados.
              </p>
            </div>
          </div>
          <Button
            className="h-11 w-full gap-2 rounded-lg md:w-auto"
            render={<Link href="/" />}
          >
            <HugeiconsIcon className="size-4" icon={StarIcon} />
            Explorar posts
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {guidelineCards.map((card) => (
          <GuidelineCard
            description={card.description}
            icon={card.icon}
            key={card.title}
            title={card.title}
          />
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ChecklistPanel items={allowedItems} title="Lo que si suma" />
        <ChecklistPanel items={blockedItems} title="Lo que se remueve" />
      </section>

      <section className="rounded-xl border border-border/60 bg-background/40 p-5">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <HugeiconsIcon className="size-5" icon={InformationCircleIcon} />
          </div>
          <div className="space-y-2">
            <h2 className="font-semibold text-lg">Moderacion y visibilidad</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Una resena puede ocultarse o eliminarse si rompe estas pautas. Las
              valoraciones de posts en acceso anticipado se muestran cuando el
              post sale al publico para evitar filtraciones.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function GuidelineCard({
  description,
  icon,
  title,
}: {
  description: string;
  icon: IconSvgElement;
  title: string;
}) {
  return (
    <article className="rounded-xl border border-border/60 bg-card/60 p-5">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200">
        <HugeiconsIcon className="size-5" icon={icon} />
      </div>
      <h2 className="font-semibold text-base">{title}</h2>
      <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    </article>
  );
}

function ChecklistPanel({
  items,
  title,
}: {
  items: readonly string[];
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/50 p-5">
      <h2 className="font-semibold text-base">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li className="flex gap-2 text-muted-foreground text-sm" key={item}>
            <span
              aria-hidden
              className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
