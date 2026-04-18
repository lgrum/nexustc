import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useBlocker, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { orpc, queryClient, safeOrpc, safeOrpcClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

type FeaturedSelection = {
  mainPostId: string | null;
  secondaryPostIds: [string | null, string | null];
};

export const Route = createFileRoute("/admin/extras/featured")({
  component: RouteComponent,
  loader: async () => {
    const [error, featuredPosts, isDefined] =
      await safeOrpcClient.post.admin.getFeaturedPosts();

    if (isDefined) {
      return {
        error: { code: error.code, message: error.message, name: error.name },
        initialSelection: {
          mainPostId: null,
          secondaryPostIds: [null, null] as [null, null],
        },
      };
    }

    if (error) {
      throw error;
    }

    const main = featuredPosts.find((p) => p.position === "main");
    const secondary = featuredPosts
      .filter((p) => p.position === "secondary")
      .toSorted((a, b) => a.order - b.order);

    return {
      error: null,
      initialSelection: {
        mainPostId: main?.postId ?? null,
        secondaryPostIds: [
          secondary[0]?.postId ?? null,
          secondary[1]?.postId ?? null,
        ] as [string | null, string | null],
      },
    };
  },
  staleTime: 0,
});

function RouteComponent() {
  const { error: loaderError, initialSelection } = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPosts, setSelectedPosts] =
    useState<FeaturedSelection>(initialSelection);
  const [savedSelectedPosts, setSavedSelectedPosts] =
    useState<FeaturedSelection>(initialSelection);
  const [blockerDialogOpen, setBlockerDialogOpen] = useState(false);
  const router = useRouter();

  const hasChanges = useMemo(
    () =>
      selectedPosts.mainPostId !== savedSelectedPosts.mainPostId ||
      selectedPosts.secondaryPostIds[0] !==
        savedSelectedPosts.secondaryPostIds[0] ||
      selectedPosts.secondaryPostIds[1] !==
        savedSelectedPosts.secondaryPostIds[1],
    [selectedPosts, savedSelectedPosts]
  );

  const isValid = useMemo(
    () =>
      selectedPosts.mainPostId !== null &&
      selectedPosts.secondaryPostIds[0] !== null &&
      selectedPosts.secondaryPostIds[1] !== null &&
      new Set([
        selectedPosts.mainPostId,
        selectedPosts.secondaryPostIds[0],
        selectedPosts.secondaryPostIds[1],
      ]).size === 3,
    [selectedPosts]
  );

  const blocker = useBlocker({
    enableBeforeUnload: true,
    shouldBlockFn: () => hasChanges,
    withResolver: true,
  });

  useEffect(() => {
    if (blocker.status === "blocked") {
      setBlockerDialogOpen(true);
    }
  }, [blocker.status]);

  useDebounceEffect(
    () => {
      setDebouncedSearch(search);
    },
    300,
    [search]
  );

  const postsQuery = useQuery(
    safeOrpc.post.admin.getFeaturedSelectionPosts.queryOptions({
      input: { search: debouncedSearch },
    })
  );

  type PostType = {
    id: string;
    title: string;
    version: string | null;
    coverImageObjectKey?: string | null;
    imageObjectKeys: string[] | null;
  };

  const [postsError, allPostsData] = postsQuery.data ?? [null, []];
  const allPosts = (allPostsData ?? []) as PostType[];

  const displayedMainPost = allPosts.find(
    (post) => post.id === selectedPosts.mainPostId
  );

  const displayedSecondaryPosts = allPosts.filter(
    (post) =>
      post.id === selectedPosts.secondaryPostIds[0] ||
      post.id === selectedPosts.secondaryPostIds[1]
  );

  const featuredMutation = useMutation({
    ...orpc.post.admin.uploadFeaturedPosts.mutationOptions(),
    onError: (error) => {
      toast.error(
        `Error al actualizar posts destacados: ${error instanceof Error ? error.message : "Error desconocido"}`,
        { duration: 5000 }
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const [key] = query.queryKey;
          return (
            typeof key === "string" &&
            (key.includes("getFeaturedSelectionPosts") ||
              key.includes("getFeaturedPosts"))
          );
        },
      });

      setSavedSelectedPosts({ ...selectedPosts });
      setSearch("");
      setDebouncedSearch("");

      toast.success("Posts destacados actualizados correctamente", {
        duration: 3000,
      });
    },
  });

  if (postsQuery.isLoading) {
    return <Spinner />;
  }

  if (loaderError) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="font-bold text-2xl">Error</h1>
        <p className="text-red-500">
          Error al cargar posts destacados: {loaderError.message}
        </p>
        <Button onClick={() => router.invalidate()}>Reintentar</Button>
      </div>
    );
  }

  if (postsError) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="font-bold text-2xl">Error</h1>
        <p className="text-red-500">
          Error al cargar posts: {postsError.message}
        </p>
        <Button onClick={() => postsQuery.refetch()}>Reintentar</Button>
      </div>
    );
  }

  const updateFeatured = async () => {
    if (!isValid) {
      return;
    }

    await featuredMutation.mutateAsync({
      mainPostId: selectedPosts.mainPostId!,
      secondaryPostIds: [
        selectedPosts.secondaryPostIds[0]!,
        selectedPosts.secondaryPostIds[1]!,
      ],
    });
  };

  const getPostPosition = (postId: string): string | null => {
    if (selectedPosts.mainPostId === postId) {
      return "main";
    }
    if (selectedPosts.secondaryPostIds[0] === postId) {
      return "secondary-1";
    }
    if (selectedPosts.secondaryPostIds[1] === postId) {
      return "secondary-2";
    }
    return null;
  };

  const setPostPosition = (postId: string, position: string) => {
    if (position === "main") {
      setSelectedPosts((prev) => ({ ...prev, mainPostId: postId }));
    } else if (position === "secondary-1") {
      setSelectedPosts((prev) => ({
        ...prev,
        secondaryPostIds: [postId, prev.secondaryPostIds[1]],
      }));
    } else if (position === "secondary-2") {
      setSelectedPosts((prev) => ({
        ...prev,
        secondaryPostIds: [prev.secondaryPostIds[0], postId],
      }));
    }
  };

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-bold text-2xl">Posts Destacados</h1>
      <div className="flex flex-row items-center gap-4">
        <h2>Posts Seleccionados</h2>
        <Button
          disabled={!(hasChanges && isValid)}
          loading={featuredMutation.isPending}
          onClick={updateFeatured}
        >
          Actualizar
        </Button>
        {hasChanges ? (
          <Badge variant="outline">Cambios sin guardar</Badge>
        ) : null}
        {!isValid && selectedPosts.mainPostId !== null ? (
          <Badge variant="destructive">
            Debe seleccionar exactamente 3 posts únicos
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="mb-2 font-semibold">Principal</h3>
          {displayedMainPost ? (
            <Item className="overflow-hidden" variant="muted">
              <ItemMedia className="size-12" variant="image">
                <img
                  alt={displayedMainPost.title}
                  src={getBucketUrl(
                    getCoverImageObjectKey(
                      displayedMainPost.imageObjectKeys,
                      displayedMainPost.coverImageObjectKey
                    ) ?? ""
                  )}
                />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="w-fit min-w-0 text-ellipsis">
                  {displayedMainPost.title}
                </ItemTitle>
                {!!displayedMainPost.version && (
                  <ItemDescription>{displayedMainPost.version}</ItemDescription>
                )}
              </ItemContent>
            </Item>
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay post principal seleccionado
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 font-semibold">Secundarios</h3>
          <ItemGroup className="grid grid-cols-2 gap-4">
            {displayedSecondaryPosts.map((post) => (
              <Item className="overflow-hidden" key={post.id} variant="muted">
                <ItemMedia className="size-12" variant="image">
                  <img
                    alt={post.title}
                    src={getBucketUrl(
                      getCoverImageObjectKey(
                        post.imageObjectKeys,
                        post.coverImageObjectKey
                      ) ?? ""
                    )}
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="w-fit min-w-0 text-ellipsis">
                    {post.title}
                  </ItemTitle>
                  {!!post.version && (
                    <ItemDescription>{post.version}</ItemDescription>
                  )}
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
          {displayedSecondaryPosts.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No hay posts secundarios seleccionados
            </p>
          )}
        </div>
      </div>

      <FieldGroup>
        <FieldSet>
          <InputGroup>
            <InputGroupInput
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              value={search}
            />
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} />
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            Selecciona exactamente 3 posts: 1 principal y 2 secundarios. Solo se
            muestran posts publicados.
          </FieldDescription>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allPosts.map((post) => {
              const currentPosition = getPostPosition(post.id);
              return (
                <FieldLabel htmlFor={post.id} key={post.id}>
                  <Field className="items-start" orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{post.title}</FieldTitle>
                      <RadioGroup
                        onValueChange={(value) =>
                          setPostPosition(post.id, value as string)
                        }
                        value={currentPosition ?? "none"}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem id={`${post.id}-main`} value="main" />
                          <label
                            className="cursor-pointer text-sm"
                            htmlFor={`${post.id}-main`}
                          >
                            Principal
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            id={`${post.id}-secondary-1`}
                            value="secondary-1"
                          />
                          <label
                            className="cursor-pointer text-sm"
                            htmlFor={`${post.id}-secondary-1`}
                          >
                            Secundario #1
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem
                            id={`${post.id}-secondary-2`}
                            value="secondary-2"
                          />
                          <label
                            className="cursor-pointer text-sm"
                            htmlFor={`${post.id}-secondary-2`}
                          >
                            Secundario #2
                          </label>
                        </div>
                      </RadioGroup>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              );
            })}
          </div>
        </FieldSet>
      </FieldGroup>

      <AlertDialog
        onOpenChange={(open) => {
          setBlockerDialogOpen(open);
          if (!open && blocker.status === "blocked") {
            blocker.reset?.();
          }
        }}
        open={blockerDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar. ¿Estás seguro de que quieres salir sin
              guardar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                blocker.reset?.();
                setBlockerDialogOpen(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                blocker.proceed?.();
                setBlockerDialogOpen(false);
              }}
            >
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
