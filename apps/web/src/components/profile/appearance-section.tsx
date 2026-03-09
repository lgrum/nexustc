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
import { convertImage, uploadBlobWithProgress } from "@/lib/utils";

const MediaCropDialog = lazy(
  () => import("@/components/profile/media-crop-dialog")
);

type PendingUpload = {
  slot: "avatar" | "banner";
  file: File;
  previewUrl: string;
  contentType: string;
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
        bannerColor: draft.bannerColor ?? PROFILE_DEFAULTS.bannerColor,
        bannerMode: draft.bannerMode,
        bannerAssetId:
          draft.bannerMode === "image"
            ? (data.settings.bannerAsset?.id ?? null)
            : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Apariencia actualizada");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar."
      );
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

    if (["image/png", "image/jpeg", "image/avif"].includes(file.type)) {
      uploadFile = await convertImage(file, "webp", 0.82);
    }

    setPendingUpload({
      slot,
      file: uploadFile,
      previewUrl: URL.createObjectURL(uploadFile),
      contentType: uploadFile.type,
    });
  };

  const finalizeUpload = useMutation({
    mutationFn: async ({
      crop,
      upload,
    }: {
      crop: {
        x: number;
        y: number;
        width: number;
        height: number;
        aspect: number;
      };
      upload: PendingUpload;
    }) => {
      const { objectKey, presignedUrl } =
        await orpcClient.profile.getUploadPolicy({
          slot: upload.slot,
          contentLength: upload.file.size,
          contentType: upload.contentType as
            | "image/avif"
            | "image/gif"
            | "image/jpeg"
            | "image/png"
            | "image/webp",
        });
      await uploadBlobWithProgress(
        upload.file,
        presignedUrl,
        setUploadProgress
      );
      return orpcClient.profile.finalizeUpload({
        slot: upload.slot,
        objectKey,
        contentLength: upload.file.size,
        contentType: upload.contentType as
          | "image/avif"
          | "image/gif"
          | "image/jpeg"
          | "image/png"
          | "image/webp",
        crop,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Media actualizada");
      setUploadProgress(0);
      setPendingUpload(null);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "No se pudo subir el archivo."
      );
    },
  });

  const previewUser = {
    ...(data.summary ?? {
      id: "me",
      href: "/profile",
      image: null,
      avatar: null,
      name: session?.user.name ?? "Tu perfil",
      avatarFallbackColor: draft.avatarFallbackColor,
      profileRoles: [],
      profileEmblems: [],
    }),
    avatarFallbackColor: draft.avatarFallbackColor,
  };

  const handleAvatarInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    handleFileSelection(event, "avatar").catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el avatar."
      );
    });
  };

  const handleBannerInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    handleFileSelection(event, "banner").catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el banner."
      );
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-card">
        <ProfileBanner
          banner={{
            mode: draft.bannerMode,
            color: draft.bannerColor,
            asset:
              draft.bannerMode === "image" && data.settings.bannerAsset
                ? {
                    objectKey: data.settings.bannerAsset.objectKey,
                    crop: data.settings.bannerAsset.crop,
                  }
                : null,
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
            user={previewUser}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-[2rem] border border-border bg-card p-4 sm:grid-cols-2">
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

      {finalizeUpload.isPending && uploadProgress > 0 ? (
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
            onConfirm={(crop) =>
              finalizeUpload.mutate({ crop, upload: pendingUpload })
            }
            onOpenChange={(open) => {
              if (!open) {
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
