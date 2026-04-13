import { Comment01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useRef, useState } from "react";

import {
  CommentContent,
  useEmojiStickerMaps,
} from "@/components/comments/comment-content";
import { PostCommentForm } from "@/components/comments/post-comment-form";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { UserLabel } from "@/components/users/user-label";
import { orpcClient } from "@/lib/orpc";
import type { EngagementPromptType } from "@/lib/types";

import { SignedIn } from "../auth/signed-in";
import { SignedOut } from "../auth/signed-out";
import { usePost } from "./post-context";

type CommentSectionProps = {
  onSelectedPromptChange: (prompt: EngagementPromptType | null) => void;
  selectedPrompt: EngagementPromptType | null;
};

export function CommentSection({
  onSelectedPromptChange,
  selectedPrompt,
}: CommentSectionProps) {
  const post = usePost();
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { emojiMap, stickerMap } = useEmojiStickerMaps();

  const commentsQuery = useQuery({
    enabled: visible,
    queryFn: async () => {
      const { comments, authors } = await orpcClient.post.getComments({
        postId: post.id,
      });

      const authorMap = new Map(authors.map((author) => [author.id, author]));

      return comments.map((comment) => ({
        ...comment,
        author: comment.authorId
          ? (authorMap.get(comment.authorId) ?? null)
          : null,
      }));
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

  const comments = commentsQuery.data ?? [];
  const commentCount = comments.length;
  const isLoadingComments = !commentsQuery.data;

  return (
    <div className="flex flex-col gap-3" ref={ref}>
      <div className="section-title">
        Comentarios{commentCount > 0 && ` (${commentCount})`}
      </div>
      <div className="flex flex-col gap-4">
        <SignedIn>
          <PostCommentForm
            placeholder="Escribe tu comentario..."
            postId={post.id}
          />
        </SignedIn>

        <SignedOut>
          <div className="rounded-lg bg-muted/30 p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-muted-foreground">
                ¿Quieres dejar un comentario?
              </p>
              <Link to="/auth">
                <Button size="sm" variant="outline">
                  Iniciar sesión
                </Button>
              </Link>
            </div>
          </div>
        </SignedOut>

        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              onSelectedPromptChange(null);
            }
          }}
          open={selectedPrompt !== null}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Responder pregunta del post</DialogTitle>
              <DialogDescription>
                Tu respuesta se publicará como un comentario normal y mostrará
                la pregunta elegida arriba del texto.
              </DialogDescription>
            </DialogHeader>

            <SignedIn>
              <PostCommentForm
                key={selectedPrompt?.id ?? "engagement-answer"}
                onSubmitted={() => onSelectedPromptChange(null)}
                placeholder="Escribe tu respuesta..."
                postId={post.id}
                prompt={selectedPrompt}
                submitLabel="Publicar respuesta"
              />
            </SignedIn>

            <SignedOut>
              <div className="rounded-2xl border border-border/60 bg-muted/40 p-5 text-center">
                <p className="text-muted-foreground">
                  Inicia sesión para responder esta pregunta y unirte al debate.
                </p>
                <Link className="mt-4 inline-flex" to="/auth">
                  <Button variant="outline">Iniciar sesión</Button>
                </Link>
              </div>
            </SignedOut>
          </DialogContent>
        </Dialog>

        {isLoadingComments ? (
          <div className="flex min-h-100 items-center justify-center">
            <Spinner />
          </div>
        ) : commentCount === 0 ? (
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
          <ScrollArea className="h-150">
            <div className="flex flex-col">
              {comments
                .filter(
                  (
                    comment
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
                      {comment.engagementPromptText && (
                        <div className="rounded-2xl border border-primary/12 bg-primary/6 px-4 py-3">
                          <div className="mb-2 font-semibold text-[11px] text-primary uppercase tracking-[0.22em]">
                            Respuesta a la pregunta
                          </div>
                          <CommentContent
                            className="font-medium text-sm text-foreground"
                            content={comment.engagementPromptText}
                            emojiMap={emojiMap}
                            stickerMap={stickerMap}
                          />
                        </div>
                      )}
                      <CommentContent
                        content={comment.content}
                        emojiMap={emojiMap}
                        stickerMap={stickerMap}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
