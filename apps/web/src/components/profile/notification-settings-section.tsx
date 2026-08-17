"use client";

import { Comment01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { orpc, orpcClient } from "@/lib/orpc";

import { ProfilePanel, ProfileSectionHeader } from "./profile-section";

export function NotificationSettingsSection({
  commentReplies,
  inboundGiftsEnabled,
  inboundTradesEnabled,
}: {
  commentReplies: boolean;
  inboundGiftsEnabled?: boolean;
  inboundTradesEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      orpcClient.profile.updateNotificationPreferences({
        commentReplies: enabled,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos actualizar tus notificaciones."
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      toast.success("Preferencia actualizada");
    },
  });
  const tradeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      orpcClient.profile.updateInboundTradePreference({
        inboundTradesEnabled: enabled,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos actualizar los intercambios entrantes."
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      toast.success("Preferencia de intercambios actualizada");
    },
  });
  const giftMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      orpcClient.profile.updateInboundGiftPreference({
        inboundGiftsEnabled: enabled,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos actualizar los regalos entrantes."
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      toast.success("Preferencia de regalos actualizada");
    },
  });
  const label = "Respuestas a mis comentarios";

  return (
    <ProfilePanel className="p-5 sm:p-6">
      <ProfileSectionHeader
        description="Elige qué avisos aparecen dentro de NeXusTC. Los cambios se guardan automáticamente."
        eyebrow="Preferencias"
        icon={Comment01Icon}
        title="Notificaciones"
      />
      <ItemGroup className="mt-6">
        <Item
          className="gap-4 rounded-[1.25rem] bg-background/45 p-4"
          variant="outline"
        >
          <ItemMedia
            className="size-10 rounded-xl bg-primary/10 text-primary"
            variant="icon"
          >
            <HugeiconsIcon aria-hidden icon={Comment01Icon} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              <label htmlFor="comment-reply-notifications">{label}</label>
            </ItemTitle>
            <ItemDescription>
              Recibe un aviso cuando alguien responda directamente a uno de tus
              comentarios.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch
              aria-label={label}
              checked={commentReplies}
              disabled={mutation.isPending}
              id="comment-reply-notifications"
              onCheckedChange={(checked) => mutation.mutate(checked)}
            />
          </ItemActions>
        </Item>
        {inboundTradesEnabled === undefined ? null : (
          <Item
            className="gap-4 rounded-[1.25rem] bg-background/45 p-4"
            variant="outline"
          >
            <ItemMedia
              className="size-10 rounded-xl bg-primary/10 text-primary"
              variant="icon"
            >
              <HugeiconsIcon aria-hidden icon={Comment01Icon} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                <label htmlFor="inbound-trade-preference">
                  Recibir ofertas de intercambio
                </label>
              </ItemTitle>
              <ItemDescription>
                Al desactivarlo se cierran las ofertas entrantes pendientes y se
                liberan sus activos reservados.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label="Recibir ofertas de intercambio"
                checked={inboundTradesEnabled}
                disabled={tradeMutation.isPending}
                id="inbound-trade-preference"
                onCheckedChange={(checked) => tradeMutation.mutate(checked)}
              />
            </ItemActions>
          </Item>
        )}
        {inboundGiftsEnabled === undefined ? null : (
          <Item
            className="gap-4 rounded-[1.25rem] bg-background/45 p-4"
            variant="outline"
          >
            <ItemMedia
              className="size-10 rounded-xl bg-primary/10 text-primary"
              variant="icon"
            >
              <HugeiconsIcon aria-hidden icon={Comment01Icon} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                <label htmlFor="inbound-gift-preference">
                  Recibir regalos de coleccionables
                </label>
              </ItemTitle>
              <ItemDescription>
                Los regalos son transferencias gratuitas y requieren tu
                aceptación explícita. Al desactivarlo se cierran los regalos
                entrantes pendientes.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label="Recibir regalos de coleccionables"
                checked={inboundGiftsEnabled}
                disabled={giftMutation.isPending}
                id="inbound-gift-preference"
                onCheckedChange={(checked) => giftMutation.mutate(checked)}
              />
            </ItemActions>
          </Item>
        )}
      </ItemGroup>
    </ProfilePanel>
  );
}
