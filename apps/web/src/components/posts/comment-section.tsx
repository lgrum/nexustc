import {
  AlertCircleIcon,
  Comment01Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  CommentContent,
  useEmojiStickerMaps,
} from "@/components/comments/comment-content";
import { EmojiPicker } from "@/components/comments/emoji-picker";
import { RichCommentInput } from "@/components/comments/rich-comment-input";
import { StickerPicker } from "@/components/comments/sticker-picker";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { useAppForm } from "@/hooks/use-app-form";
import { orpcClient } from "@/lib/orpc";

import { SignedIn } from "../auth/signed-in";
import { SignedOut } from "../auth/signed-out";
import { ErrorField } from "../forms/error-field";
import { Button } from "../ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "../ui/input-group";
import { Item, ItemContent, ItemMedia } from "../ui/item";
import { ScrollArea } from "../ui/scroll-area";
import { Spinner } from "../ui/spinner";
import { UserLabel } from "../users/user-label";
import { usePost } from "./post-context";

export function CommentSection() {
  const post = usePost();
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
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
          postId: post.id,
        });
        queryClient.invalidateQueries({
          queryKey: ["comments", post.id],
        });
        form.reset();
      } catch (error) {
        toast.error(`Ocurrió un error. ${error}`);
      }
    },
    validators: {
      onSubmit: z.object({
        content: z
          .string()
          .min(10, "Debe tener al menos 10 caracteres.")
          .max(2048, "No puede exceder los 2048 caracteres."),
      }),
    },
  });

  const currentContent = useStore(form.store, (state) => state.values.content);

  const insertToken = (token: string) => {
    const separator =
      currentContent && !currentContent.endsWith(" ") ? " " : "";
    form.setFieldValue("content", `${currentContent}${separator}${token}`);
  };

  const commentsQuery = useQuery({
    enabled: visible,
    queryFn: async () => {
      const { comments, authors } = await orpcClient.post.getComments({
        postId: post.id,
      });

      const authorMap = new Map(authors.map((a) => [a.id, a]));

      const commentsWithAuthors = comments.map((c) => ({
        ...c,
        author: c.authorId ? (authorMap.get(c.authorId) ?? null) : null,
      }));

      return commentsWithAuthors;
    },
    queryKey: ["comments", post.id],
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!commentsQuery.data) {
    return (
      <div className="flex flex-col gap-3" ref={ref}>
        <div className="section-title">Comentarios</div>
        <div className="flex min-h-100 items-center justify-center" ref={ref}>
          <Spinner />
        </div>
      </div>
    );
  }

  const commentCount = commentsQuery.data.length;

  return (
    <div className="flex flex-col gap-3" ref={ref}>
      <div className="section-title">
        Comentarios{commentCount > 0 && ` (${commentCount})`}
      </div>
      <div className="flex flex-col gap-4">
        {/* Comment Form */}
        <SignedIn>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <form.AppField name="content">
              {(field) => (
                <div className="flex flex-col gap-2">
                  <InputGroup>
                    <RichCommentInput
                      className="min-h-24 w-full border-0 bg-background shadow-none"
                      emojiMap={emojiMap}
                      onChange={(v) => field.setValue(v)}
                      placeholder="Escribe tu comentario..."
                      stickerMap={stickerMap}
                      value={field.state.value}
                    />
                    <InputGroupAddon align="block-end" className="">
                      <EmojiPicker onSelect={insertToken} />
                      <StickerPicker
                        currentContent={currentContent}
                        onSelect={insertToken}
                      />
                      <form.Subscribe
                        selector={(state) => [
                          state.canSubmit,
                          state.isSubmitting,
                        ]}
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
                            Enviar
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
        </SignedIn>
        {/* Sign in prompt for logged out users */}
        <SignedOut>
          <div className="flex flex-col items-center gap-3 bg-muted/30 p-6 text-center rounded-lg">
            <p className="text-muted-foreground">
              ¿Quieres dejar un comentario?
            </p>
            <Link to="/auth">
              <Button size="sm" variant="outline">
                Iniciar sesión
              </Button>
            </Link>
          </div>
        </SignedOut>
        {/* Comments List */}
        <ScrollArea className="h-150">
          <div className="flex flex-col">
            {commentCount === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <HugeiconsIcon
                    className="size-6 text-muted-foreground"
                    icon={Comment01Icon}
                  />
                </div>
                <p className="text-muted-foreground">
                  Aún no hay comentarios. ¡Sé el primero!
                </p>
              </div>
            ) : (
              commentsQuery.data
                .filter(
                  (
                    comment
                    // little workaround to convince TS that author is not null
                  ): comment is typeof comment & {
                    author: NonNullable<typeof comment.author>;
                  } => comment.author !== null
                )
                .map((comment) => (
                  <div
                    className="group flex gap-4 border-border border-t p-4 first:border-t-0"
                    key={comment.id}
                  >
                    <Link params={{ id: comment.author.id }} to="/user/$id">
                      <ProfileAvatar
                        className="size-10 rounded-full ring-2 ring-background transition-transform group-hover:scale-105"
                        user={comment.author}
                      />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link params={{ id: comment.author.id }} to="/user/$id">
                          <UserLabel
                            className="font-semibold transition-colors hover:text-primary"
                            user={comment.author}
                          />
                        </Link>
                        <span className="text-muted-foreground text-xs">•</span>
                        <time className="text-muted-foreground text-xs">
                          {format(comment.createdAt, "d MMM yyyy", {
                            locale: es,
                          })}
                        </time>
                      </div>
                      <CommentContent
                        content={comment.content}
                        emojiMap={emojiMap}
                        stickerMap={stickerMap}
                      />
                    </div>
                  </div>
                ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
