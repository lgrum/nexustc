import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useImperativeHandle, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";

import { SortableGrid } from "@/components/admin/sortable-grid";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convertImage, getBucketUrl } from "@/lib/utils";

export type ImageItem =
  | { type: "existing"; key: string }
  | { type: "new"; file: File; previewUrl: string };

export type EditImagesPayload = {
  order: ({ type: "existing"; key: string } | { type: "new"; index: number })[];
  newFiles: File[];
};

export type ImageEditorRef = {
  getPayload: () => EditImagesPayload;
};

type ImageEditorProps = {
  initialImageKeys: string[];
  ref: React.Ref<ImageEditorRef>;
};

function getItemId(item: ImageItem): string {
  return item.type === "existing" ? item.key : item.previewUrl;
}

function getImageSrc(item: ImageItem): string {
  if (item.type === "existing") {
    return getBucketUrl(item.key);
  }
  return item.previewUrl;
}

export function ImageEditor({ initialImageKeys, ref }: ImageEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ImageItem[]>(() =>
    initialImageKeys.map((key) => ({ key, type: "existing" }))
  );

  useImperativeHandle(ref, () => ({
    getPayload: () => {
      const newFiles: File[] = [];
      const newFileIndexMap = new Map<File, number>();

      for (const item of items) {
        if (item.type === "new" && !newFileIndexMap.has(item.file)) {
          newFileIndexMap.set(item.file, newFiles.length);
          newFiles.push(item.file);
        }
      }

      const order = items.map((item) => {
        if (item.type === "existing") {
          return { key: item.key, type: "existing" as const };
        }
        return {
          index: newFileIndexMap.get(item.file)!,
          type: "new" as const,
        };
      });

      return { newFiles, order };
    },
  }));

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) {
      return;
    }

    const files = [...event.target.files].filter((f) =>
      f.type.startsWith("image/")
    );

    const converted = await Promise.all(
      files.map((file) => {
        if (file.type.startsWith("image/gif")) {
          return file;
        }
        return convertImage(file, "webp", 0.8);
      })
    );

    const newItems: ImageItem[] = converted.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      type: "new" as const,
    }));

    setItems((prev) => [...prev, ...newItems]);
    event.target.value = "";
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const item = prev[index];
      if (item?.type === "new") {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <section className="col-span-2 space-y-4">
      <Label>Imágenes</Label>

      {items.length > 0 && (
        <SortableGrid
          className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6"
          getItemId={getItemId}
          items={items}
          setItems={setItems}
        >
          {(
            item,
            index,
            { ref: sortableRef, isDragging, isSelected, onSelect }
          ) => (
            <Card
              className={`cursor-grab ${isDragging ? "border-secondary" : ""} ${isSelected ? "ring-2 ring-primary" : ""}`}
              data-label={getItemId(item)}
              key={getItemId(item)}
              onClick={onSelect}
              ref={sortableRef as React.Ref<HTMLDivElement>}
            >
              <CardHeader>
                <CardTitle className="text-wrap text-sm">
                  {item.type === "existing"
                    ? `Imagen ${index + 1}`
                    : item.file.name}
                </CardTitle>
                <CardAction>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(index);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex justify-center">
                <img
                  alt={`Imagen ${index + 1}`}
                  className="max-h-32 rounded object-contain"
                  src={getImageSrc(item)}
                />
              </CardContent>
            </Card>
          )}
        </SortableGrid>
      )}

      {items.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No hay imágenes. Agrega nuevas imágenes abajo.
        </p>
      )}

      <Input
        accept="image/*"
        className="w-full"
        multiple
        onChange={async (e) => {
          await toast.promise(handleFileChange(e), {
            error: (error) => `Error al convertir imágenes: ${error}`,
            loading: "Convirtiendo imágenes...",
            success: "Imágenes convertidas!",
          });
        }}
        ref={fileInputRef}
        type="file"
      />
    </section>
  );
}
