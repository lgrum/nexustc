"use client";

import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { orpc, queryClient, safeOrpc } from "@/lib/orpc";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

const MAX_WEEKLY_OVERRIDE_POSTS = 15;

export type LoaderError = {
  code: string;
  message: string;
  name: string;
} | null;

export function ClientPage({
  loaderError,
  initialSelectedIds,
}: {
  loaderError: LoaderError;
  initialSelectedIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPosts, setSelectedPosts] =
    useState<string[]>(initialSelectedIds);
  const [savedSelectedPosts, setSavedSelectedPosts] =
    useState<string[]>(initialSelectedIds);
  const [blockerDialogOpen, setBlockerDialogOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();

  // Calculate dirty state - compare current selection with last saved state
  const isDirty = useMemo(() => {
    const sortedSaved = [...savedSelectedPosts].toSorted();
    const sortedCurrent = [...selectedPosts].toSorted();

    return (
      sortedSaved.length !== sortedCurrent.length ||
      !sortedSaved.every((id, index) => id === sortedCurrent[index])
    );
  }, [savedSelectedPosts, selectedPosts]);

  // Calculate number of changes for the badge
  const changesCount = useMemo(() => {
    const added = selectedPosts.filter(
      (id) => !savedSelectedPosts.includes(id)
    );
    const removed = savedSelectedPosts.filter(
      (id) => !selectedPosts.includes(id)
    );
    return added.length + removed.length;
  }, [savedSelectedPosts, selectedPosts]);

  useEffect(() => {
    if (!isDirty) {
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
  }, [isDirty]);

  // Debounce search input
  useDebounceEffect(
    () => {
      setDebouncedSearch(search);
    },
    300,
    [search]
  );

  // Fetch all posts with search filter
  const postsQuery = useQuery(
    safeOrpc.post.admin.getWeeklySelectionPosts.queryOptions({
      input: { search: debouncedSearch },
    })
  );
  const postsData = postsQuery.data;

  // Extract data and errors from safe queries
  const [postsError, allPosts] = postsData ?? [null, []];

  // Derive displayed weekly posts from allPosts filtered by selectedPosts state
  // This ensures the UI reflects the current selection, not stale server data
  const displayedWeeklyPosts = (allPosts ?? []).filter((post) =>
    selectedPosts.includes(post.id)
  );

  const weeklyMutation = useMutation({
    ...orpc.post.admin.uploadWeeklyPosts.mutationOptions(),
    onError: (error) => {
      toast.error(
        `Error al actualizar posts semanales: ${error instanceof Error ? error.message : "Error desconocido"}`,
        { duration: 5000 }
      );
    },
    onSuccess: async () => {
      // Invalidate ALL weekly-related queries to prevent stale data
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const [key] = query.queryKey;
          return (
            typeof key === "string" &&
            (key.includes("getWeeklySelectionPosts") ||
              key.includes("getSelectedWeeklyPosts"))
          );
        },
      });

      // Reset state to reflect saved data (prevents stale state on navigation back)
      setSavedSelectedPosts([...selectedPosts]);
      setSearch("");
      setDebouncedSearch("");
    },
  });

  // Loading state
  if (postsQuery.isLoading) {
    return <Spinner />;
  }

  // Error state for loader
  if (loaderError) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="font-bold text-2xl">Error</h1>
        <p className="text-red-500">
          Error al cargar posts semanales: {loaderError.message}
        </p>
        <Button onClick={() => router.refresh()}>Reintentar</Button>
      </div>
    );
  }

  // Error state for posts query
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

  const updateWeeklys = async () => {
    await weeklyMutation.mutateAsync(selectedPosts);
  };

  const toggleSelectedPost = (postId: string, checked: boolean) => {
    if (checked && selectedPosts.length >= MAX_WEEKLY_OVERRIDE_POSTS) {
      toast.error(
        `Solo puedes seleccionar hasta ${MAX_WEEKLY_OVERRIDE_POSTS} juegos manuales.`
      );
      return;
    }

    setSelectedPosts(
      checked
        ? [...selectedPosts, postId]
        : selectedPosts.filter((id) => id !== postId)
    );
  };

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-bold text-2xl">Juegos de la Semana</h1>
      <div className="flex flex-row items-center gap-4">
        <h2>Juegos Seleccionados</h2>
        <Button
          disabled={!isDirty}
          loading={weeklyMutation.isPending}
          onClick={updateWeeklys}
        >
          Actualizar
        </Button>
        {isDirty ? (
          <Badge variant="outline">
            {changesCount} cambio{changesCount === 1 ? "" : "s"} sin guardar
          </Badge>
        ) : null}
      </div>
      <ItemGroup className="grid grid-cols-5 gap-4">
        {displayedWeeklyPosts.map((post) => (
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
            <ItemActions>
              <Button
                onClick={() =>
                  setSelectedPosts((oldPosts) =>
                    oldPosts.filter((p) => p !== post.id)
                  )
                }
                size="icon"
                variant="outline"
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
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
            Es posible que los juegos subidos o actualizados recientemente aÃºn
            no estÃ©n disponibles.
          </FieldDescription>
          <div className="grid grid-cols-5 gap-4">
            {allPosts?.map((post) => (
              <FieldLabel htmlFor={post.id} key={post.id}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{post.title}</FieldTitle>
                  </FieldContent>
                  <Checkbox
                    checked={selectedPosts.includes(post.id)}
                    id={post.id}
                    onCheckedChange={(v) =>
                      toggleSelectedPost(post.id, Boolean(v))
                    }
                    value={post.id}
                  />
                </Field>
              </FieldLabel>
            ))}
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
    </main>
  );
}
