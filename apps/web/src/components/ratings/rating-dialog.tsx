import { RATING_REVIEW_MAX_LENGTH } from "@repo/shared/constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  // Fetch existing user rating
  const { data: existingRating, isLoading } = useQuery({
    enabled: open,
    queryFn: () => orpcClient.rating.getUserRating({ postId }),
    queryKey: ["rating", "user", postId],
  });

  // Sync form values when dialog opens or existing rating data changes
  useEffect(() => {
    if (open && existingRating) {
      setRating(existingRating.rating);
      setReview(existingRating.review);
    } else if (open && existingRating === null) {
      // No existing rating - reset to defaults
      setRating(0);
      setReview("");
    }
  }, [open, existingRating]);

  // Reset when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setRating(0);
      setReview("");
    }
    onOpenChange(newOpen);
  };

  // Create/update rating mutation
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

  // Delete rating mutation
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

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {hasExistingRating ? "Actualizar Valoración" : "Valorar este post"}
          </DialogTitle>
          <DialogDescription>
            {hasExistingRating
              ? "Modifica tu valoración y reseña."
              : "Selecciona una puntuación del 1 al 10 y opcionalmente deja una reseña."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <p className="text-muted-foreground text-sm">Tu puntuación</p>
              <StarRatingInput
                disabled={isSubmitting}
                onChange={setRating}
                size="lg"
                value={rating}
              />
              {rating > 0 && (
                <p className="font-bold text-2xl">{rating} / 10</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-medium text-sm" htmlFor="review">
                  Reseña (opcional)
                </label>
                <span
                  className={`text-xs ${
                    review.length > RATING_REVIEW_MAX_LENGTH
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {review.length} / {RATING_REVIEW_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                className="min-h-32 resize-none"
                disabled={isSubmitting}
                id="review"
                maxLength={RATING_REVIEW_MAX_LENGTH}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Escribe tu reseña aquí... (Puedes usar **negrita**, *cursiva*, y [enlaces](url))"
                value={review}
              />
              <p className="text-muted-foreground text-xs">
                Markdown básico soportado: negrita, cursiva, enlaces y listas.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {hasExistingRating && (
            <Button
              disabled={isSubmitting}
              onClick={() => deleteMutation.mutate()}
              type="button"
              variant="destructive"
            >
              Eliminar
            </Button>
          )}
          <div className="flex-1" />
          <Button
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => createMutation.mutate()}
            type="button"
          >
            {isSubmitting
              ? "Guardando..."
              : hasExistingRating
                ? "Actualizar"
                : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
