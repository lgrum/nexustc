import { Dialog } from "@base-ui/react/dialog";
import { Cancel01Icon, Edit02Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { orpcClient } from "@/lib/orpc";

import { useEmojiStickerMaps } from "./comment-content";
import { EmojiPicker } from "./emoji-picker";
import { RichCommentInput } from "./rich-comment-input";
import { StickerPicker } from "./sticker-picker";

type EditCommentDialogProps = {
  commentId: string;
  content: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
};

const COMMENT_MIN_LENGTH = 10;
const COMMENT_MAX_LENGTH = 2048;

export function EditCommentDialog({
  commentId,
  content,
  open,
  onOpenChange,
  postId,
}: EditCommentDialogProps) {
  const queryClient = useQueryClient();
  const { emojiMap, stickerMap } = useEmojiStickerMaps();
  const [draft, setDraft] = useState(content);

  useEffect(() => {
    if (open) {
      setDraft(content);
    }
  }, [content, open]);

  const editMutation = useMutation({
    mutationFn: () =>
      orpcClient.post.editOwnComment({
        commentId,
        content: draft,
      }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos editar tu comentario.";
      toast.error(message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      onOpenChange(false);
      toast.success("Comentario actualizado.");
    },
  });

  const insertToken = (token: string) => {
    const separator = draft && !draft.endsWith(" ") ? " " : "";
    setDraft(`${draft}${separator}${token}`);
  };

  const trimmedLength = draft.trim().length;
  const isUnderLimit = trimmedLength < COMMENT_MIN_LENGTH;
  const isOverLimit = draft.length > COMMENT_MAX_LENGTH;
  const isUnchanged = draft === content;
  const isSubmitting = editMutation.isPending;
  const canSubmit =
    !isSubmitting && !isUnderLimit && !isOverLimit && !isUnchanged;

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setDraft(content);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-background/80 backdrop-blur-md duration-200 data-closed:animate-out data-open:animate-in" />
        <Dialog.Popup className="max-h-[95dvh] data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-2xl outline-none backdrop-blur-xl duration-200 data-closed:animate-out data-open:animate-in sm:max-w-lg">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-linear-to-b from-primary/[0.14] via-primary/4 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-24 h-48 w-48 rounded-full bg-amber-400/18 blur-3xl"
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
                  className="-inset-3 absolute rounded-full bg-primary/25 blur-xl"
                />
                <div className="relative flex size-16 items-center justify-center rounded-2xl border border-primary/35 bg-primary/12 shadow-[0_0_32px_-4px] shadow-primary/45">
                  <HugeiconsIcon
                    className="size-7 text-primary"
                    icon={Edit02Icon}
                    strokeWidth={1.8}
                  />
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-0.5 font-semibold text-[10.5px] text-primary uppercase tracking-[0.24em]">
                  Tu comentario
                </span>
                <Dialog.Title
                  className="display-heading text-balance text-[24px] text-foreground leading-[1.1] sm:text-[26px]"
                  // oxlint-disable-next-line jsx_a11y/heading-has-content
                  render={<h2 />}
                >
                  Editar comentario
                </Dialog.Title>
                <Dialog.Description
                  className="max-w-md text-pretty text-[13px] text-muted-foreground leading-relaxed"
                  render={<p />}
                >
                  Ajusta el contenido y guarda los cambios. Solo tu cuenta puede
                  editar este comentario.
                </Dialog.Description>
              </div>
            </header>

            <div className="glow-line mx-auto w-[80%]" />

            <div className="relative flex flex-col gap-3 px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground/90 text-sm">
                  Contenido
                </span>
                <span
                  className={`text-[11px] tabular-nums ${
                    isOverLimit ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {trimmedLength} / {COMMENT_MAX_LENGTH}
                </span>
              </div>
              <InputGroup>
                <RichCommentInput
                  className="min-h-36 w-full border-0 bg-background/40 shadow-none"
                  emojiMap={emojiMap}
                  onChange={setDraft}
                  placeholder="Edita tu comentario..."
                  stickerMap={stickerMap}
                  value={draft}
                />
                <InputGroupAddon align="block-end">
                  <EmojiPicker onSelect={insertToken} />
                  <StickerPicker
                    currentContent={draft}
                    onSelect={insertToken}
                  />
                </InputGroupAddon>
              </InputGroup>
              <p
                className={`text-[11px] leading-snug ${
                  isUnderLimit || isOverLimit
                    ? "text-destructive"
                    : "text-muted-foreground/80"
                }`}
              >
                {isUnderLimit &&
                  `Escribe al menos ${COMMENT_MIN_LENGTH} caracteres para guardar.`}
                {!isUnderLimit &&
                  isOverLimit &&
                  `El comentario no puede exceder ${COMMENT_MAX_LENGTH} caracteres.`}
                {!isUnderLimit &&
                  !isOverLimit &&
                  "Puedes usar emojis y stickers disponibles en tu cuenta."}
              </p>
            </div>
          </div>

          <div className="relative flex flex-col gap-2 border-border/50 border-t bg-background/30 p-4 sm:flex-row sm:items-center sm:gap-3">
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
              className="h-11 w-full gap-2 rounded-lg font-semibold text-[13.5px] tracking-wide shadow-glow-primary/25 transition-[background-color,box-shadow] duration-200 hover:shadow-glow-primary/45 sm:flex-1"
              disabled={!canSubmit}
              onClick={() => editMutation.mutate()}
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={SentIcon}
                strokeWidth={1.8}
              />
              <span>{isSubmitting ? "Guardando..." : "Guardar cambios"}</span>
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
