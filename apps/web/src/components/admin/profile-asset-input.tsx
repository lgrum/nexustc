import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { orpcClient } from "@/lib/orpc";
import {
  convertImage,
  getBucketUrl,
  uploadBlobWithProgress,
} from "@/lib/utils";

export function ProfileAssetInput({
  slot,
  label,
  currentObjectKey,
  onUploaded,
}: {
  slot: "role-icon" | "role-overlay" | "emblem-icon";
  label: string;
  currentObjectKey?: string | null;
  onUploaded: (assetId: string, objectKey: string) => void;
}) {
  const inputId = `${slot}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      let uploadFile = file;

      if (["image/png", "image/jpeg", "image/avif"].includes(file.type)) {
        uploadFile = await convertImage(file, "webp", 0.82);
      }

      const { objectKey, presignedUrl } =
        await orpcClient.profileAdmin.media.getUploadPolicy({
          slot,
          contentLength: uploadFile.size,
          contentType: uploadFile.type as
            | "image/avif"
            | "image/gif"
            | "image/jpeg"
            | "image/png"
            | "image/webp",
        });

      await uploadBlobWithProgress(uploadFile, presignedUrl, () => undefined);
      return orpcClient.profileAdmin.media.finalizeUpload({
        slot,
        objectKey,
        contentLength: uploadFile.size,
        contentType: uploadFile.type as
          | "image/avif"
          | "image/gif"
          | "image/jpeg"
          | "image/png"
          | "image/webp",
      });
    },
    onSuccess: (asset) => {
      onUploaded(asset.id, asset.objectKey);
      toast.success("Asset subido");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo subir el asset."
      );
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <label className="font-medium text-sm" htmlFor={inputId}>
        {label}
      </label>
      {currentObjectKey ? (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background p-2">
          <img
            alt=""
            aria-hidden="true"
            className="max-h-full max-w-full object-contain"
            src={getBucketUrl(currentObjectKey)}
          />
        </div>
      ) : null}
      <Input
        accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
        disabled={uploadMutation.isPending}
        id={inputId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            uploadMutation.mutate(file);
          }
        }}
        type="file"
      />
      {uploadMutation.isPending ? <Spinner className="size-4" /> : null}
    </div>
  );
}
