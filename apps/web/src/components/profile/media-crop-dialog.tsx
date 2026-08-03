import { useRef, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
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

function fullImageCrop(): PercentCrop {
  return {
    height: 100,
    unit: "%",
    width: 100,
    x: 0,
    y: 0,
  };
}

export default function MediaCropDialog({
  open,
  onOpenChange,
  imageSrc,
  aspect,
  title,
  description,
  onConfirm,
  progress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  aspect?: number;
  title: string;
  description: string;
  onConfirm: (crop: ImagePercentCrop) => Promise<void> | void;
  progress?: number;
}) {
  const [crop, setCrop] = useState<PercentCrop>();
  const [isConfirming, setIsConfirming] = useState(false);
  const isConfirmingRef = useRef(false);

  const confirmCrop = async () => {
    if (!crop || isConfirmingRef.current) {
      return;
    }

    isConfirmingRef.current = true;
    setIsConfirming(true);

    try {
      await onConfirm({
        height: crop.height,
        width: crop.width,
        x: crop.x,
        y: crop.y,
      });
    } finally {
      isConfirmingRef.current = false;
      setIsConfirming(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!isConfirmingRef.current) {
          onOpenChange(nextOpen);
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-lg" showCloseButton={!isConfirming}>
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
                setCrop(
                  aspect
                    ? centerAspectCrop(width, height, aspect)
                    : fullImageCrop()
                );
              }}
              src={imageSrc}
            />
          </ReactCrop>
          <Button
            aria-busy={isConfirming}
            disabled={!crop || isConfirming}
            onClick={confirmCrop}
          >
            {isConfirming ? (
              <Spinner aria-hidden="true" className="size-4" />
            ) : null}
            {isConfirming
              ? progress && progress > 0
                ? `Subiendo archivo: ${progress}%`
                : "Guardando recorte…"
              : "Guardar recorte"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
