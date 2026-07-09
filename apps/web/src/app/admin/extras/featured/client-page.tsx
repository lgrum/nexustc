"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import { useAppForm } from "@/hooks/use-app-form";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { createDeferredMediaSelectionFromExistingId } from "@/lib/deferred-media";
import type { DeferredMediaSelection } from "@/lib/deferred-media";
import { orpc, queryClient, safeOrpc } from "@/lib/orpc";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

const FEATURED_THUMBNAIL_ASPECT = 4 / 3;

export type FeaturedSelection = {
  mainPostId: string | null;
  mainThumbnailMediaId: string | null;
  secondaryPostIds: [string | null, string | null];
  secondaryThumbnailMediaIds: [string | null, string | null];
};

type FeaturedThumbnailFormValues = {
  mainThumbnailSelection: DeferredMediaSelection;
  secondaryOneThumbnailSelection: DeferredMediaSelection;
  secondaryTwoThumbnailSelection: DeferredMediaSelection;
};

export type LoaderError = {
  code: string;
  message: string;
  name: string;
} | null;

export function ClientPage({
  loaderError,
  initialSelection,
}: {
  loaderError: LoaderError;
  initialSelection: FeaturedSelection;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPosts, setSelectedPosts] =
    useState<FeaturedSelection>(initialSelection);
  const [savedSelectedPosts, setSavedSelectedPosts] =
    useState<FeaturedSelection>(initialSelection);
  const initialThumbnailValues = useMemo(
    () => createThumbnailFormValues(initialSelection),
    [initialSelection]
  );
  const [savedThumbnailFingerprint, setSavedThumbnailFingerprint] = useState(
    () => getThumbnailFingerprint(initialThumbnailValues)
  );
  const [blockerDialogOpen, setBlockerDialogOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();

  const featuredForm = useAppForm({
    defaultValues: initialThumbnailValues,
    onSubmit: async ({ value }) => {
      if (!isValid) {
        return;
      }

      const result = await featuredMutation.mutateAsync({
        mainPostId: selectedPosts.mainPostId!,
        mainThumbnailSelection: value.mainThumbnailSelection,
        secondaryPostIds: [
          selectedPosts.secondaryPostIds[0]!,
          selectedPosts.secondaryPostIds[1]!,
        ],
        secondaryThumbnailSelections: [
          value.secondaryOneThumbnailSelection,
          value.secondaryTwoThumbnailSelection,
        ],
      });
      const savedSelection = {
        mainPostId: selectedPosts.mainPostId,
        mainThumbnailMediaId: result.mainThumbnailMediaId,
        secondaryPostIds: selectedPosts.secondaryPostIds,
        secondaryThumbnailMediaIds: [
          result.secondaryThumbnailMediaIds[0],
          result.secondaryThumbnailMediaIds[1],
        ],
      } satisfies FeaturedSelection;
      const savedThumbnailValues = createThumbnailFormValues(savedSelection);

      setSavedSelectedPosts(savedSelection);
      setSavedThumbnailFingerprint(
        getThumbnailFingerprint(savedThumbnailValues)
      );
      featuredForm.reset(savedThumbnailValues);
      setSearch("");
      setDebouncedSearch("");
    },
  });
  const thumbnailValues = useStore(featuredForm.store, (state) => state.values);

  const hasChanges = useMemo(
    () =>
      selectedPosts.mainPostId !== savedSelectedPosts.mainPostId ||
      selectedPosts.secondaryPostIds[0] !==
        savedSelectedPosts.secondaryPostIds[0] ||
      selectedPosts.secondaryPostIds[1] !==
        savedSelectedPosts.secondaryPostIds[1] ||
      getThumbnailFingerprint(thumbnailValues) !== savedThumbnailFingerprint,
    [
      selectedPosts,
      savedSelectedPosts,
      savedThumbnailFingerprint,
      thumbnailValues,
    ]
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

  useEffect(() => {
    if (!hasChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const handleClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const { target } = event;
      const anchor =
        target instanceof Element ? target.closest("a[href]") : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }

      event.preventDefault();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
      setBlockerDialogOpen(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [hasChanges]);

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
  const postsData = postsQuery.data;

  type PostType = {
    id: string;
    title: string;
    version: string | null;
    coverImageObjectKey?: string | null;
    imageObjectKeys: string[] | null;
  };

  const [postsError, allPostsData] = postsData ?? [null, []];
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
              key.includes("getFeaturedPosts") ||
              key.includes("media"))
          );
        },
      });

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
        <Button onClick={() => router.refresh()}>Reintentar</Button>
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
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.nativeEvent.submitter === null) {
          return;
        }
        featuredForm.handleSubmit();
      }}
    >
      <h1 className="font-bold text-2xl">Posts Destacados</h1>
      <div className="flex flex-row items-center gap-4">
        <h2>Posts Seleccionados</h2>
        <Button
          disabled={!(hasChanges && isValid)}
          loading={featuredMutation.isPending}
          type="submit"
        >
          Actualizar
        </Button>
        {hasChanges ? (
          <Badge variant="outline">Cambios sin guardar</Badge>
        ) : null}
        {!isValid && selectedPosts.mainPostId !== null ? (
          <Badge variant="destructive">
            Debe seleccionar exactamente 3 posts Ãºnicos
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
                    getThumbnailImageObjectKeys(
                      displayedMainPost.imageObjectKeys,
                      1,
                      displayedMainPost.coverImageObjectKey
                    )[0] ?? ""
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
          <featuredForm.AppField name="mainThumbnailSelection">
            {(field) => (
              <field.MediaField
                crop={{
                  aspect: FEATURED_THUMBNAIL_ASPECT,
                  description:
                    "Recorta la miniatura del landing en formato 4:3.",
                  title: "Recortar miniatura destacada",
                }}
                description="Opcional. Si queda vacia, se usara la portada o primera imagen del post."
                label="Miniatura del landing"
                maxItems={1}
                ownerKind="Juego"
              />
            )}
          </featuredForm.AppField>
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
                      getThumbnailImageObjectKeys(
                        post.imageObjectKeys,
                        1,
                        post.coverImageObjectKey
                      )[0] ?? ""
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
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <featuredForm.AppField name="secondaryOneThumbnailSelection">
              {(field) => (
                <field.MediaField
                  crop={{
                    aspect: FEATURED_THUMBNAIL_ASPECT,
                    description:
                      "Recorta la miniatura del primer secundario en formato 4:3.",
                    title: "Recortar miniatura secundaria #1",
                  }}
                  description="Opcional. Si queda vacia, se usara la portada o primera imagen del post."
                  label="Miniatura secundaria #1"
                  maxItems={1}
                  ownerKind="Juego"
                />
              )}
            </featuredForm.AppField>
            <featuredForm.AppField name="secondaryTwoThumbnailSelection">
              {(field) => (
                <field.MediaField
                  crop={{
                    aspect: FEATURED_THUMBNAIL_ASPECT,
                    description:
                      "Recorta la miniatura del segundo secundario en formato 4:3.",
                    title: "Recortar miniatura secundaria #2",
                  }}
                  description="Opcional. Si queda vacia, se usara la portada o primera imagen del post."
                  label="Miniatura secundaria #2"
                  maxItems={1}
                  ownerKind="Juego"
                />
              )}
            </featuredForm.AppField>
          </div>
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
          if (!open) {
            setPendingHref(null);
          }
        }}
        open={blockerDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Â¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar. Â¿EstÃ¡s seguro de que quieres salir
              sin guardar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingHref(null);
                setBlockerDialogOpen(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingHref) {
                  router.push(pendingHref);
                }
                setBlockerDialogOpen(false);
              }}
            >
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function createThumbnailFormValues(
  selection: FeaturedSelection
): FeaturedThumbnailFormValues {
  return {
    mainThumbnailSelection: createDeferredMediaSelectionFromExistingId(
      selection.mainThumbnailMediaId
    ),
    secondaryOneThumbnailSelection: createDeferredMediaSelectionFromExistingId(
      selection.secondaryThumbnailMediaIds[0]
    ),
    secondaryTwoThumbnailSelection: createDeferredMediaSelectionFromExistingId(
      selection.secondaryThumbnailMediaIds[1]
    ),
  };
}

function getSelectionFingerprint(selection: DeferredMediaSelection) {
  return selection
    .map((item) =>
      item.kind === "existing"
        ? `existing:${item.mediaId}`
        : `pending:${item.file.name}:${item.file.size}:${item.file.lastModified}`
    )
    .join("|");
}

function getThumbnailFingerprint(values: FeaturedThumbnailFormValues) {
  return [
    getSelectionFingerprint(values.mainThumbnailSelection),
    getSelectionFingerprint(values.secondaryOneThumbnailSelection),
    getSelectionFingerprint(values.secondaryTwoThumbnailSelection),
  ].join("::");
}
