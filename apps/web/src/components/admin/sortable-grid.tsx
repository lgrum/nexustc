import { arrayMove } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

type SortableItemProps = {
  id: string;
  index: number;
  children: (props: {
    ref: React.Ref<HTMLElement>;
    isDragging: boolean;
    isSelected: boolean;
    onSelect: () => void;
  }) => ReactNode;
  isSelected: boolean;
  onSelect: () => void;
};

function SortableItem({
  id,
  index,
  children,
  isSelected,
  onSelect,
}: SortableItemProps) {
  const { ref, isDragging } = useSortable({ id, index });

  return children({ isDragging, isSelected, onSelect, ref });
}

type SortableGridProps<T> = {
  items: T[];
  getItemId: (item: T) => string;
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  className?: string;
  children: (
    item: T,
    index: number,
    props: {
      ref: React.Ref<HTMLElement>;
      isDragging: boolean;
      isSelected: boolean;
      onSelect: () => void;
    }
  ) => ReactNode;
};

function getSortableIndices(source: object): {
  from: number;
  to: number;
} | null {
  if (
    "initialIndex" in source &&
    typeof source.initialIndex === "number" &&
    "index" in source &&
    typeof source.index === "number"
  ) {
    return { from: source.initialIndex, to: source.index };
  }
  return null;
}

export function SortableGrid<T>({
  items,
  getItemId,
  setItems,
  className,
  children,
}: SortableGridProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const isDraggingRef = useRef(false);

  const toggleSelect = useCallback((id: string) => {
    if (isDraggingRef.current) {
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(
    (
      event: Parameters<
        NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>
      >[0]
    ) => {
      requestAnimationFrame(() => {
        isDraggingRef.current = false;
      });

      if (event.canceled) {
        return;
      }

      const { source } = event.operation;
      if (!source) {
        return;
      }

      const indices = getSortableIndices(source);
      if (!indices || indices.from === indices.to) {
        return;
      }

      const sourceId = String(source.id);
      const currentSelected = selectedIdsRef.current;

      if (currentSelected.has(sourceId) && currentSelected.size > 1) {
        setItems((prev) => {
          // Build the projected array as if only the dragged item moved
          const projected = arrayMove(prev, indices.from, indices.to);

          // Find a non-selected neighbor near the drop position to anchor insertion
          let anchorId: string | null = null;
          let insertAfterAnchor = true;

          for (let i = indices.to - 1; i >= 0; i -= 1) {
            const id = getItemId(projected[i]);
            if (!currentSelected.has(id)) {
              anchorId = id;
              break;
            }
          }

          if (anchorId === null) {
            insertAfterAnchor = false;
            for (let i = indices.to + 1; i < projected.length; i += 1) {
              const id = getItemId(projected[i]);
              if (!currentSelected.has(id)) {
                anchorId = id;
                break;
              }
            }
          }

          const selected = prev.filter((item) =>
            currentSelected.has(getItemId(item))
          );
          const rest = prev.filter(
            (item) => !currentSelected.has(getItemId(item))
          );

          if (anchorId === null) {
            return selected;
          }

          const anchorIdx = rest.findIndex(
            (item) => getItemId(item) === anchorId
          );
          const insertAt = insertAfterAnchor ? anchorIdx + 1 : anchorIdx;
          rest.splice(insertAt, 0, ...selected);
          return rest;
        });
        setSelectedIds(new Set());
      } else {
        setItems((prev) => arrayMove(prev, indices.from, indices.to));
      }
    },
    [setItems, getItemId]
  );

  return (
    <DragDropProvider onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
      <div className={className}>
        {items.map((item, index) => {
          const id = getItemId(item);
          return (
            <SortableItem
              id={id}
              index={index}
              isSelected={selectedIds.has(id)}
              key={id}
              onSelect={() => toggleSelect(id)}
            >
              {(props) => children(item, index, props)}
            </SortableItem>
          );
        })}
      </div>
    </DragDropProvider>
  );
}
