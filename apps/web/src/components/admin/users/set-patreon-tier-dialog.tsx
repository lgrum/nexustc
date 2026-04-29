import { PATRON_TIER_PROFILE_BADGES } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppForm } from "@/hooks/use-app-form";
import { orpcClient } from "@/lib/orpc";

import type { AdminUser } from "./types";

const permanentTierOptions: { label: string; value: PatronTier }[] = [
  {
    label: PATRON_TIER_PROFILE_BADGES.level69 ?? "LvL 69",
    value: "level69",
  },
  {
    label: PATRON_TIER_PROFILE_BADGES.level100 ?? "LvL 100",
    value: "level100",
  },
];

export function SetPatreonTierDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const form = useAppForm({
    defaultValues: {
      tier: "level69" as PatronTier,
    },
    onSubmit: async ({ value }) => {
      await toast
        .promise(
          orpcClient.user.admin.setPermanentPatreonTier({
            tier: value.tier as "level69" | "level100",
            userId: user.id,
          }),
          {
            error: "Error al asignar tier permanente.",
            loading: "Asignando tier permanente...",
            success: "Tier permanente asignado.",
          }
        )
        .unwrap();

      onOpenChange(false);
      onSuccess();
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar Patreon permanente</DialogTitle>
          <DialogDescription>
            Asignar un tier Patreon permanente a {user.name} ({user.email})
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="space-y-4">
            <form.AppField name="tier">
              {(field) => (
                <field.SelectField
                  label="Tier"
                  options={permanentTierOptions}
                />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton className="w-full">Guardar</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
