import { Image01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { PROFILE_DEFAULTS } from "@repo/shared/profile";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ProfileBanner } from "@/components/profile/profile-banner";
import { ProfileNameplate } from "@/components/profile/profile-nameplate";
import {
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { Button } from "@/components/ui/button";
import { ColorPickerField } from "@/components/ui/color-picker-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient } from "@/lib/orpc";
import { uploadProfileMedia } from "@/lib/profile-media-upload";
import { convertImage, cropImage } from "@/lib/utils";
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
  const { data: session } = authClient.useSession();
  const { data } = useSuspenseQuery(orpc.profile.getMySettings.queryOptions());

  const draftKey = [
    data.settings.avatarFallbackColor,
    data.settings.bannerColor,
    data.settings.bannerMode,
  ].join(":");

  return (
    <AppearanceSectionContent data={data} key={draftKey} session={session} />
  );
}

function AppearanceSectionContent({
  data,
  session,
}: {
  data: Awaited<ReturnType<(typeof orpcClient.profile)["getMySettings"]>>;
  session: ReturnType<typeof authClient.useSession>["data"];
}) {
  const queryClient = useQueryClient();
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
      trackEvent("profile_appearance_saved", {
        bannerMode: draft.bannerMode,
      });
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
      trackEvent("profile_media_removed", {
        slot: "avatar",
      });
      toast.success("Avatar eliminado");
    },
  });

  const removeBannerMutation = useMutation({
    mutationFn: () => orpcClient.profile.removeBanner(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      trackEvent("profile_media_removed", {
        slot: "banner",
      });
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
      await uploadProfileMedia(file, presignedUrl, setUploadProgress);
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
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      trackEvent("profile_media_uploaded", {
        contentType: variables.file.type,
        slot: variables.slot,
      });
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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
      <ProfilePanel className="overflow-hidden lg:sticky lg:top-4">
        <div className="border-border/60 border-b px-5 py-4">
          <p className="font-semibold text-[11px] text-primary uppercase tracking-[0.26em]">
            Vista previa pública
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            Así se verá tu identidad principal para otros usuarios.
          </p>
        </div>
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
        <div className="-mt-14 flex flex-col gap-4 px-5 pb-6 sm:px-6">
          <ProfileAvatar
            className="size-24 border-4 border-card shadow-lg"
            user={previewUser}
          />
          <ProfileNameplate
            nameClassName="font-lexend text-2xl font-black"
            showEmblems
            showProfileRoles
            user={previewUser}
          />
        </div>
      </ProfilePanel>

      <div className="space-y-5">
        <ProfilePanel className="p-5 sm:p-6">
          <ProfileSectionHeader
            description={
              data.entitlements.canUseAnimatedAvatar
                ? "Puedes usar una imagen estática o animada y elegir el color de respaldo."
                : `Las imágenes animadas requieren ${data.labels.animatedAvatarRequiredTier}.`
            }
            eyebrow="Identidad"
            icon={UserIcon}
            title="Avatar"
          />
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <label
                className="font-medium text-sm"
                htmlFor="profile-avatar-file"
              >
                Archivo de avatar
              </label>
              <Input
                accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
                id="profile-avatar-file"
                onChange={handleAvatarInputChange}
                type="file"
              />
            </div>
            <ColorPickerField
              id="profile-avatar-fallback-color"
              label="Color de respaldo"
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  avatarFallbackColor: value,
                }))
              }
              value={
                draft.avatarFallbackColor ??
                PROFILE_DEFAULTS.avatarFallbackColor
              }
            />
            <Button
              disabled={removeAvatarMutation.isPending}
              onClick={() => removeAvatarMutation.mutate()}
              variant="outline"
            >
              Quitar avatar
            </Button>
          </div>
        </ProfilePanel>

        <ProfilePanel className="p-5 sm:p-6">
          <ProfileSectionHeader
            description={
              data.entitlements.canUseUploadedBanner
                ? data.entitlements.canUseAnimatedBanner
                  ? "Puedes usar un color, una imagen estática o una animación."
                  : `Las animaciones requieren ${data.labels.animatedBannerRequiredTier}.`
                : `Las imágenes de banner requieren ${data.labels.uploadedBannerRequiredTier}.`
            }
            eyebrow="Atmósfera"
            icon={Image01Icon}
            title="Banner"
          />
          <div className="mt-5 space-y-4">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Tipo de banner"
            >
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
            <div className="space-y-2">
              <label
                className="font-medium text-sm"
                htmlFor="profile-banner-file"
              >
                Archivo de banner
              </label>
              <Input
                accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
                disabled={!data.entitlements.canUseUploadedBanner}
                id="profile-banner-file"
                onChange={handleBannerInputChange}
                type="file"
              />
            </div>
            <Button
              disabled={removeBannerMutation.isPending}
              onClick={() => removeBannerMutation.mutate()}
              variant="outline"
            >
              Restaurar banner de color
            </Button>
          </div>
        </ProfilePanel>

        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm leading-5">
            Guarda los colores y el modo del banner cuando la vista previa esté
            lista.
          </p>
          <Button
            className="shrink-0"
            disabled={updateAppearanceMutation.isPending}
            onClick={() => updateAppearanceMutation.mutate()}
          >
            {updateAppearanceMutation.isPending ? (
              <Spinner className="size-4" />
            ) : null}
            Guardar apariencia
          </Button>
        </div>

        {uploadMediaMutation.isPending && uploadProgress > 0 ? (
          <p
            aria-live="polite"
            className="text-muted-foreground text-sm"
            role="status"
          >
            Subiendo archivo: {uploadProgress}%
          </p>
        ) : null}
      </div>

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
