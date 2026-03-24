import { useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import type { PercentCrop } from "react-image-crop";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImagePercentCrop } from "@/lib/utils";

import "react-image-crop/dist/ReactCrop.css";

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export default function MediaCropDialog({
  open,
  onOpenChange,
  imageSrc,
  aspect,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  aspect: number;
  title: string;
  description: string;
  onConfirm: (crop: ImagePercentCrop) => void;
}) {
  const [crop, setCrop] = useState<PercentCrop>();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <ReactCrop
            aspect={aspect}
            crop={crop}
            onChange={(_, nextCrop) => setCrop(nextCrop)}
          >
            <img
              alt={title}
              className="max-h-[60vh] w-full rounded-2xl object-contain"
              onLoad={(event) => {
                const { width, height } = event.currentTarget;
                setCrop(centerAspectCrop(width, height, aspect));
              }}
              src={imageSrc}
            />
          </ReactCrop>
          <Button
            disabled={!crop}
            onClick={() => {
              if (!crop) {
                return;
              }

              onConfirm({
                height: crop.height,
                width: crop.width,
                x: crop.x,
                y: crop.y,
              });
            }}
          >
            Guardar recorte
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
