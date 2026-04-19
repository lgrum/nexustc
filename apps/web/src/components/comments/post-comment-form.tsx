import { AlertCircleIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import z from "zod";

import { useAppForm } from "@/hooks/use-app-form";
import { orpcClient } from "@/lib/orpc";
import type { EngagementPromptType } from "@/lib/types";

import { ErrorField } from "../forms/error-field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "../ui/input-group";
import { Item, ItemContent, ItemMedia } from "../ui/item";
import { CommentContent, useEmojiStickerMaps } from "./comment-content";
import { EmojiPicker } from "./emoji-picker";
import { RichCommentInput } from "./rich-comment-input";
import { StickerPicker } from "./sticker-picker";

const commentFormSchema = z.object({
  content: z
    .string()
    .min(10, "Debe tener al menos 10 caracteres.")
    .max(2048, "No puede exceder los 2048 caracteres."),
});

type PostCommentFormProps = {
  onSubmitted?: () => void;
  parentId?: string;
  placeholder: string;
  postId: string;
  prompt?: EngagementPromptType | null;
  submitLabel?: string;
};

export function PostCommentForm({
  onSubmitted,
  parentId,
  placeholder,
  postId,
  prompt,
  submitLabel = "Enviar",
}: PostCommentFormProps) {
  const queryClient = useQueryClient();
  const { emojiMap, stickerMap } = useEmojiStickerMaps();
  const form = useAppForm({
    defaultValues: {
      content: "",
    },
    onSubmit: async (formData) => {
      try {
        await orpcClient.post.createComment({
          content: formData.value.content,
          engagementPrompt: prompt
            ? {
                id: prompt.id,
                source: prompt.source,
              }
            : undefined,
          parentId,
          postId,
        });

        await queryClient.invalidateQueries({
          queryKey: ["comments", postId],
        });

        form.reset();
        onSubmitted?.();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No pudimos publicar tu comentario.";
        toast.error(message);
      }
    },
    validators: {
      onSubmit: commentFormSchema,
    },
  });

  const currentContent = useStore(form.store, (state) => state.values.content);

  const insertToken = (token: string) => {
    const separator =
      currentContent && !currentContent.endsWith(" ") ? " " : "";
    form.setFieldValue("content", `${currentContent}${separator}${token}`);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.AppField name="content">
        {(field) => (
          <div className="flex flex-col gap-2">
            {prompt && (
              <div className="rounded-2xl border border-primary/15 bg-primary/6 p-3">
                <div className="mb-2 font-semibold text-[11px] text-primary uppercase tracking-[0.24em]">
                  Respondiendo a esta pregunta
                </div>
                <CommentContent
                  className="font-medium text-sm text-foreground"
                  content={prompt.text}
                  emojiMap={emojiMap}
                  stickerMap={stickerMap}
                />
              </div>
            )}
            <InputGroup>
              <RichCommentInput
                className="min-h-24 w-full border-0 bg-background shadow-none"
                emojiMap={emojiMap}
                onChange={(value) => field.setValue(value)}
                placeholder={placeholder}
                stickerMap={stickerMap}
                value={field.state.value}
              />
              <InputGroupAddon align="block-end">
                <EmojiPicker onSelect={insertToken} />
                <StickerPicker
                  currentContent={currentContent}
                  onSelect={insertToken}
                />
                <form.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting]}
                >
                  {([canSubmit, isSubmitting]) => (
                    <InputGroupButton
                      className="ml-auto"
                      disabled={!canSubmit}
                      loading={isSubmitting}
                      size="sm"
                      type="submit"
                      variant="default"
                    >
                      <HugeiconsIcon className="size-4" icon={SentIcon} />
                      {submitLabel}
                    </InputGroupButton>
                  )}
                </form.Subscribe>
              </InputGroupAddon>
            </InputGroup>
            {field.state.meta.errors.length > 0 && (
              <Item variant="outline">
                <ItemMedia>
                  <HugeiconsIcon
                    className="size-5 text-destructive"
                    icon={AlertCircleIcon}
                  />
                </ItemMedia>
                <ItemContent>
                  <ErrorField field={field} />
                </ItemContent>
              </Item>
            )}
          </div>
        )}
      </form.AppField>
    </form>
  );
}
