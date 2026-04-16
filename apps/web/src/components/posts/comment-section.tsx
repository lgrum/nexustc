import {
  Comment01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useConfirm } from "@omit/react-confirm-dialog";
import { MAX_PINNED_ITEMS_PER_POST } from "@repo/shared/constants";
import type { Role } from "@repo/shared/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { authClient } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";
import type { EngagementPromptType } from "@/lib/types";

import { SignedIn } from "../auth/signed-in";
import { SignedOut } from "../auth/signed-out";
import { ProfileNameplate } from "../profile/profile-nameplate";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { emojiMap, stickerMap } = useEmojiStickerMaps();
  const confirm = useConfirm();
  const role = session?.user.role as Role | undefined;
  const canPinComments = role
    ? authClient.admin.checkRolePermission({
        permissions: { comments: ["pin"] },
        role,
      })
    : false;
  const canDeleteComments = role
    ? authClient.admin.checkRolePermission({
        permissions: { comments: ["delete"] },
        role,
      })
    : false;

  const setPinnedMutation = useMutation({
    mutationFn: ({
      commentId,
      pinned,
    }: {
      commentId: string;
      pinned: boolean;
    }) => orpcClient.post.setCommentPinned({ commentId, pinned }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : `No se pudo actualizar el comentario fijado.`;

      toast.error(
        message.includes(`${MAX_PINNED_ITEMS_PER_POST}`)
          ? message
          : `Ocurrio un error. ${message}`
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["comments", post.id],
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({
      commentId,
      isOwnComment,
    }: {
      commentId: string;
      isOwnComment: boolean;
    }) =>
      isOwnComment
        ? orpcClient.post.deleteOwnComment({ commentId })
        : orpcClient.post.deleteComment({ commentId }),
    onError: (error) => {
      toast.error(`No se pudo eliminar el comentario. ${error}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["comments", post.id],
      });
    },
  });

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
    <Card ref={ref}>
      <CardHeader>
        <CardTitle className="section-title">
          Comentarios{commentCount > 0 && ` (${commentCount})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
                Quieres dejar un comentario?
              </p>
              <Link to="/auth">
                <Button size="sm" variant="outline">
                  Iniciar sesion
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
                Tu respuesta se publicara como un comentario normal y mostrara
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
                  Inicia sesion para responder esta pregunta y unirte al debate.
                </p>
                <Link className="mt-4 inline-flex" to="/auth">
                  <Button variant="outline">Iniciar sesion</Button>
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
              Aun no hay comentarios. Se el primero.
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
                .map((comment) => {
                  const isOwnComment = session?.user.id === comment.author.id;
                  const canDeleteComment = canDeleteComments || isOwnComment;

                  return (
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
                          <Link
                            params={{ id: comment.author.id }}
                            to="/user/$id"
                          >
                            <ProfileNameplate
                              className="font-semibold transition-colors hover:text-primary"
                              user={comment.author}
                            />
                          </Link>
                          <span className="text-muted-foreground text-xs">
                            •
                          </span>
                          <time className="text-muted-foreground text-xs">
                            {format(comment.createdAt, "d MMM yyyy", {
                              locale: es,
                            })}
                          </time>
                          {comment.pinnedAt && (
                            <span className="rounded-full bg-muted px-1 py-1 font-medium text-muted-foreground text-xs inline-flex items-center gap-1">
                              <HugeiconsIcon
                                className="size-5"
                                icon={PinIcon}
                              />
                            </span>
                          )}
                          {(canPinComments || canDeleteComment) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    className="ml-auto"
                                    size="icon"
                                    variant="ghost"
                                  />
                                }
                              >
                                <HugeiconsIcon icon={MoreHorizontalIcon} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canPinComments && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setPinnedMutation.mutate({
                                        commentId: comment.id,
                                        pinned: comment.pinnedAt === null,
                                      })
                                    }
                                    variant={
                                      comment.pinnedAt
                                        ? "destructive"
                                        : "default"
                                    }
                                  >
                                    <HugeiconsIcon icon={PinIcon} />
                                    {comment.pinnedAt ? "Desfijar" : "Fijar"}
                                  </DropdownMenuItem>
                                )}
                                {canDeleteComment && canPinComments && (
                                  <DropdownMenuSeparator />
                                )}
                                {canDeleteComment && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      if (
                                        await confirm({
                                          title: "Eliminar Comentario",
                                          description:
                                            "¿Estás seguro de que quieres eliminar este comentario? Esta acción no se puede deshacer.",
                                        })
                                      ) {
                                        deleteCommentMutation.mutate({
                                          commentId: comment.id,
                                          isOwnComment,
                                        });
                                      }
                                    }}
                                    variant="destructive"
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} />
                                    Eliminar
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        {comment.engagementPromptText && (
                          <div className="rounded-2xl border border-primary/12 bg-primary/6 px-4 py-3">
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
                  );
                })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
