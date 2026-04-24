import { Dialog } from "@base-ui/react/dialog";
import {
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RATING_REVIEW_MAX_LENGTH } from "@repo/shared/constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { orpcClient } from "@/lib/orpc";

import { StarRatingInput } from "./star-rating-input";

type RatingDialogProps = {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RatingDialog({
  postId,
  open,
  onOpenChange,
}: RatingDialogProps) {
  const queryClient = useQueryClient();

  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState<string>("");

  const { data: existingRating, isLoading } = useQuery({
    enabled: open,
    queryFn: () => orpcClient.rating.getUserRating({ postId }),
    queryKey: ["rating", "user", postId],
  });

  useEffect(() => {
    if (open && existingRating) {
      setRating(existingRating.rating);
      setReview(existingRating.review);
    } else if (open && existingRating === null) {
      setRating(0);
      setReview("");
    }
  }, [open, existingRating]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setRating(0);
      setReview("");
    }
    onOpenChange(newOpen);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      orpcClient.rating.create({
        postId,
        rating,
        review,
      }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos guardar tu valoracion.";
      toast.error(message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rating", "user", postId] });
      queryClient.invalidateQueries({ queryKey: ["ratings", postId] });
      queryClient.invalidateQueries({ queryKey: ["rating", "stats", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      handleOpenChange(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => orpcClient.rating.delete({ postId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rating", "user", postId] });
      queryClient.invalidateQueries({ queryKey: ["ratings", postId] });
      queryClient.invalidateQueries({ queryKey: ["rating", "stats", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      handleOpenChange(false);
    },
  });

  const isSubmitting = createMutation.isPending || deleteMutation.isPending;
  const canSubmit = rating >= 1 && rating <= 10 && !isSubmitting;
  const hasExistingRating = !!existingRating;
  const isOverLimit = review.length > RATING_REVIEW_MAX_LENGTH;

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-background/80 backdrop-blur-md duration-200 data-closed:animate-out data-open:animate-in" />
        <Dialog.Popup className="max-h-[95dvh] data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-2xl outline-none backdrop-blur-xl duration-200 data-closed:animate-out data-open:animate-in sm:max-w-lg">
          {/* Ambient atmosphere — amber wash with a primary accent */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-linear-to-b from-amber-400/[0.14] via-amber-400/4 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-20 h-56 w-56 rounded-full bg-amber-400/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
          />

          <Dialog.Close
            className="absolute top-3 right-3 z-10 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            render={<button type="button" />}
          >
            <HugeiconsIcon
              className="size-4"
              icon={Cancel01Icon}
              strokeWidth={2}
            />
            <span className="sr-only">Cerrar</span>
          </Dialog.Close>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <header className="relative flex flex-col items-center gap-4 px-8 pt-10 pb-4 text-center">
              <div className="relative">
                <span
                  aria-hidden
                  className="-inset-3 absolute rounded-full bg-amber-400/30 blur-xl"
                />
                <div className="relative flex size-16 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-400/15 shadow-[0_0_32px_-4px] shadow-amber-400/55">
                  <HugeiconsIcon
                    className="size-7 text-amber-200"
                    icon={StarIcon}
                    strokeWidth={1.8}
                  />
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 font-semibold text-[10.5px] text-amber-200 uppercase tracking-[0.24em]">
                  {hasExistingRating ? "Tu valoración" : "Nueva valoración"}
                </span>
                <Dialog.Title
                  className="display-heading text-balance text-[24px] text-foreground leading-[1.1] sm:text-[26px]"
                  // oxlint-disable-next-line jsx_a11y/heading-has-content
                  render={<h2 />}
                >
                  {hasExistingRating
                    ? "Actualizar valoración"
                    : "Valorar este post"}
                </Dialog.Title>
                <Dialog.Description
                  className="max-w-md text-pretty text-[13px] text-muted-foreground leading-relaxed"
                  render={<p />}
                >
                  {hasExistingRating
                    ? "Modifica tu puntuación o reseña. Los cambios se aplican al instante."
                    : "Selecciona una puntuación del 1 al 10 y, si quieres, deja una reseña."}
                </Dialog.Description>
              </div>
            </header>

            <div className="glow-line mx-auto w-[80%]" />

            {isLoading ? (
              <div className="flex justify-center py-10">
                <div className="size-8 animate-spin rounded-full border-4 border-amber-400/80 border-t-transparent" />
              </div>
            ) : (
              <div className="relative flex flex-col gap-5 px-6 py-5">
                <div className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-4 py-5">
                  <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                    Tu puntuación
                  </p>
                  <StarRatingInput
                    disabled={isSubmitting}
                    onChange={setRating}
                    size="lg"
                    value={rating}
                  />
                  <p
                    className={`font-bold text-2xl tabular-nums transition-colors ${
                      rating > 0 ? "text-amber-200" : "text-muted-foreground/60"
                    }`}
                  >
                    {rating > 0 ? `${rating} / 10` : "— / 10"}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label
                      className="font-medium text-foreground/90 text-sm"
                      htmlFor="review"
                    >
                      Reseña{" "}
                      <span className="text-muted-foreground/70">
                        (opcional)
                      </span>
                    </label>
                    <span
                      className={`text-[11px] tabular-nums ${
                        isOverLimit
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {review.length} / {RATING_REVIEW_MAX_LENGTH}
                    </span>
                  </div>
                  <Textarea
                    className="min-h-32 resize-none border-border/60 bg-background/40"
                    disabled={isSubmitting}
                    id="review"
                    maxLength={RATING_REVIEW_MAX_LENGTH}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="Escribe tu reseña aquí... (Puedes usar **negrita**, *cursiva*, y [enlaces](url))"
                    value={review}
                  />
                  <p className="text-[11px] text-muted-foreground/80 leading-snug">
                    Markdown básico soportado: negrita, cursiva, enlaces y
                    listas.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="relative flex flex-col gap-2 border-border/50 border-t bg-background/30 p-4 sm:flex-row sm:items-center sm:gap-3">
            {hasExistingRating && (
              <Button
                className="h-11 w-full gap-2 rounded-lg text-[12.5px] sm:w-auto sm:shrink-0 sm:px-4"
                disabled={isSubmitting}
                onClick={() => deleteMutation.mutate()}
                type="button"
                variant="destructive"
              >
                <HugeiconsIcon className="size-4" icon={Delete02Icon} />
                Eliminar
              </Button>
            )}
            <div className="hidden flex-1 sm:block" />
            <Button
              className="h-11 w-full gap-2 rounded-lg border-border/70 text-[12.5px] text-muted-foreground hover:text-foreground sm:w-auto sm:shrink-0 sm:px-4"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              className="group h-11 w-full gap-2 rounded-lg font-semibold text-[13.5px] tracking-wide shadow-glow-primary/25 transition-[background-color,box-shadow] duration-200 hover:shadow-glow-primary/45 sm:flex-1"
              disabled={!canSubmit}
              onClick={() => createMutation.mutate()}
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={hasExistingRating ? Edit02Icon : StarIcon}
                strokeWidth={1.8}
              />
              <span>
                {isSubmitting
                  ? "Guardando..."
                  : hasExistingRating
                    ? "Actualizar valoración"
                    : "Enviar valoración"}
              </span>
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
