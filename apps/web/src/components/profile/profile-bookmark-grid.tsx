"use client";

import type { PostProps } from "@/components/landing/post-card";
import { PostCard } from "@/components/landing/post-card";
import { ProfileCollectionState } from "@/components/profile/profile-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type BookmarkFilter = "comics" | "games";

const FILTERS: {
  emptyDescription: string;
  label: string;
  value: BookmarkFilter;
}[] = [
  {
    emptyDescription: "No hay juegos favoritos en esta colección.",
    label: "Juegos",
    value: "games",
  },
  {
    emptyDescription: "No hay comics favoritos en esta colección.",
    label: "Comics",
    value: "comics",
  },
];

function filterItems(items: PostProps[], filter: BookmarkFilter) {
  return items.filter((item) =>
    filter === "games" ? item.type === "post" : item.type === "comic"
  );
}

export function ProfileBookmarkGrid({
  className,
  items,
  renderOwnerAction,
}: {
  className?: string;
  items: PostProps[];
  renderOwnerAction?: (item: PostProps) => React.ReactNode;
}) {
  return (
    <Tabs className={cn("gap-5", className)} defaultValue="games">
      <TabsList
        aria-label="Filtrar favoritos"
        className="w-full justify-start rounded-xl bg-muted/45"
      >
        {FILTERS.map((filter) => (
          <TabsTrigger
            className="rounded-lg px-4 data-active:bg-background data-active:text-foreground data-active:shadow-sm dark:data-active:bg-background/80"
            key={filter.value}
            value={filter.value}
          >
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {FILTERS.map((filter) => {
        const filteredItems = filterItems(items, filter.value);

        return (
          <TabsContent key={filter.value} value={filter.value}>
            {filteredItems.length === 0 ? (
              <ProfileCollectionState
                description={filter.emptyDescription}
                kind="empty"
                title="Nada por aquí todavía"
              />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredItems.map((item) => (
                  <li className="relative min-w-0" key={item.id}>
                    <PostCard post={item} />
                    {renderOwnerAction ? (
                      <div className="absolute top-2 right-2 z-20">
                        {renderOwnerAction(item)}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
