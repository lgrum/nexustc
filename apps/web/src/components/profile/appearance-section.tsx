import { PROFILE_DEFAULTS } from "@repo/shared/profile";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ProfileBanner } from "@/components/profile/profile-banner";
import { ProfileNameplate } from "@/components/profile/profile-nameplate";
import { Button } from "@/components/ui/button";
import { ColorPickerField } from "@/components/ui/color-picker-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient } from "@/lib/orpc";
import { convertImage, cropImage, uploadBlobWithProgress } from "@/lib/utils";
import type { ImagePercentCrop } from "@/lib/utils";

const MediaCropDialog = lazy(
  () => import("@/components/profile/media-crop-dialog")
);

type PendingUpload = {
  slot: "avatar" | "banner";
  file: File;
  previewUrl: string;
};

export function AppearanceSection() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { data } = useSuspenseQuery(orpc.profile.getMySettings.queryOptions());
  const [draft, setDraft] = useState({
    avatarFallbackColor:
      data.settings.avatarFallbackColor ?? PROFILE_DEFAULTS.avatarFallbackColor,
    bannerColor: data.settings.bannerColor ?? PROFILE_DEFAULTS.bannerColor,
    bannerMode: data.settings.bannerMode,
  });
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null
  );
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    setDraft({
      avatarFallbackColor:
        data.settings.avatarFallbackColor ??
        PROFILE_DEFAULTS.avatarFallbackColor,
      bannerColor: data.settings.bannerColor ?? PROFILE_DEFAULTS.bannerColor,
      bannerMode: data.settings.bannerMode,
    });
  }, [
    data.settings.avatarFallbackColor,
    data.settings.bannerColor,
    data.settings.bannerMode,
  ]);

  const updateAppearanceMutation = useMutation({
    mutationFn: () =>
      orpcClient.profile.updateAppearance({
        avatarFallbackColor:
          draft.avatarFallbackColor ?? PROFILE_DEFAULTS.avatarFallbackColor,
        bannerAssetId:
          draft.bannerMode === "image"
            ? (data.settings.bannerAsset?.id ?? null)
            : null,
        bannerColor: draft.bannerColor ?? PROFILE_DEFAULTS.bannerColor,
        bannerMode: draft.bannerMode,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar."
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Apariencia actualizada");
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: () => orpcClient.profile.removeAvatar(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Avatar eliminado");
    },
  });

  const removeBannerMutation = useMutation({
    mutationFn: () => orpcClient.profile.removeBanner(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      toast.success("Banner restaurado");
    },
  });

  const handleFileSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
    slot: "avatar" | "banner"
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    let uploadFile = file;
    const isGifUpload = file.type === "image/gif";

    if (slot === "banner" && !data.entitlements.canUseUploadedBanner) {
      throw new Error("No puedes subir banners.");
    }

    if (isGifUpload) {
      if (slot === "avatar" && !data.entitlements.canUseAnimatedAvatar) {
        throw new Error(
          `Los avatares animados requieren ${data.labels.animatedAvatarRequiredTier}.`
        );
      }

      if (slot === "banner" && !data.entitlements.canUseAnimatedBanner) {
        throw new Error(
          `Los banners animados requieren ${data.labels.animatedBannerRequiredTier}.`
        );
      }

      uploadMediaMutation.mutate({ file, slot });
      return;
    }

    if (["image/png", "image/jpeg", "image/avif"].includes(file.type)) {
      uploadFile = await convertImage(file, "webp", 0.82);
    }

    setPendingUpload({
      file: uploadFile,
      previewUrl: URL.createObjectURL(uploadFile),
      slot,
    });
  };

  const uploadMediaMutation = useMutation({
    mutationFn: async ({
      file,
      slot,
    }: {
      file: File;
      slot: "avatar" | "banner";
    }) => {
      const { objectKey, presignedUrl } =
        await orpcClient.profile.getUploadPolicy({
          contentLength: file.size,
          contentType: file.type as
            | "image/avif"
            | "image/gif"
            | "image/jpeg"
            | "image/png"
            | "image/webp",
          slot,
        });
      await uploadBlobWithProgress(file, presignedUrl, setUploadProgress);
      return orpcClient.profile.finalizeUpload({
        contentLength: file.size,
        contentType: file.type as
          | "image/avif"
          | "image/gif"
          | "image/jpeg"
          | "image/png"
          | "image/webp",
        objectKey,
        slot,
      });
    },
    onError: (error) => {
      setUploadProgress(0);
      toast.error(
        error instanceof Error ? error.message : "No se pudo subir el archivo."
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Media actualizada");
      setUploadProgress(0);
      setPendingUpload((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl);
        }

        return null;
      });
    },
  });

  const previewUser = {
    ...(data.summary ?? {
      avatar: null,
      avatarFallbackColor: draft.avatarFallbackColor,
      href: "/profile",
      id: "me",
      image: null,
      name: session?.user.name ?? "Tu perfil",
      profileEmblems: [],
      profileRoles: [],
    }),
    avatarFallbackColor: draft.avatarFallbackColor,
  };

  const handleAvatarInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    try {
      await handleFileSelection(event, "avatar");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el avatar."
      );
    }
  };

  const handleBannerInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    try {
      await handleFileSelection(event, "banner");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el banner."
      );
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-4xl border border-border bg-card">
        <ProfileBanner
          banner={{
            asset:
              draft.bannerMode === "image" && data.settings.bannerAsset
                ? {
                    objectKey: data.settings.bannerAsset.objectKey,
                  }
                : null,
            color: draft.bannerColor,
            mode: draft.bannerMode,
          }}
          className="rounded-none border-0"
        />
        <div className="-mt-14 flex flex-col gap-4 px-4 pb-5 sm:px-6">
          <ProfileAvatar
            className="size-24 border-4 border-card shadow-lg"
            user={previewUser}
          />
          <ProfileNameplate
            nameClassName="text-2xl font-black"
            showEmblems
            showProfileRoles
            user={previewUser}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-4xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-semibold">Avatar</h3>
            <p className="text-muted-foreground text-sm">
              {data.entitlements.canUseAnimatedAvatar
                ? "Puedes usar avatar estático o animado."
                : `Los avatares animados requieren ${data.labels.animatedAvatarRequiredTier}.`}
            </p>
          </div>
          <Input
            accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
            onChange={handleAvatarInputChange}
            type="file"
          />
          <ColorPickerField
            id="profile-avatar-fallback-color"
            label="Color de fallback"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                avatarFallbackColor: value,
              }))
            }
            value={
              draft.avatarFallbackColor ?? PROFILE_DEFAULTS.avatarFallbackColor
            }
          />
          <Button
            onClick={() => removeAvatarMutation.mutate()}
            variant="outline"
          >
            Quitar avatar
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-semibold">Banner</h3>
            <p className="text-muted-foreground text-sm">
              {data.entitlements.canUseUploadedBanner
                ? data.entitlements.canUseAnimatedBanner
                  ? "Puedes usar banner estático o animado."
                  : `Los banners animados requieren ${data.labels.animatedBannerRequiredTier}.`
                : `Los banners subidos requieren ${data.labels.uploadedBannerRequiredTier}.`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                setDraft((current) => ({ ...current, bannerMode: "color" }))
              }
              type="button"
              variant={draft.bannerMode === "color" ? "default" : "outline"}
            >
              Color
            </Button>
            <Button
              disabled={!data.entitlements.canUseUploadedBanner}
              onClick={() =>
                setDraft((current) => ({ ...current, bannerMode: "image" }))
              }
              type="button"
              variant={draft.bannerMode === "image" ? "default" : "outline"}
            >
              Imagen
            </Button>
          </div>
          <ColorPickerField
            id="profile-banner-color"
            label="Color del banner"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                bannerColor: value,
              }))
            }
            value={draft.bannerColor ?? PROFILE_DEFAULTS.bannerColor}
          />
          <Input
            accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
            disabled={!data.entitlements.canUseUploadedBanner}
            onChange={handleBannerInputChange}
            type="file"
          />
          <Button
            onClick={() => removeBannerMutation.mutate()}
            variant="outline"
          >
            Quitar banner
          </Button>
        </div>
      </section>

      <Button
        disabled={updateAppearanceMutation.isPending}
        onClick={() => updateAppearanceMutation.mutate()}
      >
        Guardar apariencia
      </Button>

      {uploadMediaMutation.isPending && uploadProgress > 0 ? (
        <p className="text-muted-foreground text-sm">
          Subiendo: {uploadProgress}%
        </p>
      ) : null}

      {pendingUpload ? (
        <Suspense fallback={<Spinner />}>
          <MediaCropDialog
            aspect={pendingUpload.slot === "avatar" ? 1 : 3.2}
            description={
              pendingUpload.slot === "avatar"
                ? "Ajusta el encuadre para que el avatar quede centrado."
                : "Ajusta el encuadre del banner."
            }
            imageSrc={pendingUpload.previewUrl}
            onConfirm={async (crop: ImagePercentCrop) => {
              try {
                const croppedFile = await cropImage(pendingUpload.file, crop);
                uploadMediaMutation.mutate({
                  file: croppedFile,
                  slot: pendingUpload.slot,
                });
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "No se pudo recortar la imagen."
                );
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                if (pendingUpload?.previewUrl) {
                  URL.revokeObjectURL(pendingUpload.previewUrl);
                }
                setPendingUpload(null);
                setUploadProgress(0);
              }
            }}
            open={!!pendingUpload}
            title={
              pendingUpload.slot === "avatar"
                ? "Recortar avatar"
                : "Ajustar banner"
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
}
