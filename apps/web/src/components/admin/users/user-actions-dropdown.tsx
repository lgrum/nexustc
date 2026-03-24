import { useConfirm } from "@omit/react-confirm-dialog";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

import { BanUserDialog } from "./ban-user-dialog";
import { SetPasswordDialog } from "./set-password-dialog";
import { SetRoleDialog } from "./set-role-dialog";
import type { AdminUser } from "./types";

export function UserActionsDropdown({
  user,
  onRefresh,
}: {
  user: AdminUser;
  onRefresh: () => void;
}) {
  const confirm = useConfirm();
  const [roleOpen, setRoleOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const handleUnban = async () => {
    const confirmed = await confirm({
      cancelText: "Cancelar",
      confirmText: "Desbanear",
      description: `¿Desbanear a ${user.name} (${user.email})?`,
      title: "Desbanear Usuario",
    });

    if (confirmed) {
      await toast
        .promise(authClient.admin.unbanUser({ userId: user.id }), {
          error: "Error al desbanear usuario.",
          loading: "Desbaneando usuario...",
          success: "Usuario desbaneado.",
        })
        .unwrap();
      onRefresh();
    }
  };

  const handleRevokeSessions = async () => {
    const confirmed = await confirm({
      cancelText: "Cancelar",
      confirmText: "Revocar",
      description: `¿Revocar todas las sesiones de ${user.name}?`,
      title: "Revocar Sesiones",
    });

    if (confirmed) {
      await toast
        .promise(authClient.admin.revokeUserSessions({ userId: user.id }), {
          error: "Error al revocar sesiones.",
          loading: "Revocando sesiones...",
          success: "Sesiones revocadas.",
        })
        .unwrap();
    }
  };

  const handleImpersonate = async () => {
    const confirmed = await confirm({
      cancelText: "Cancelar",
      confirmText: "Suplantar",
      description: `¿Suplantar a ${user.name} (${user.email})? Serás redirigido.`,
      title: "Suplantar Usuario",
    });

    if (confirmed) {
      await toast
        .promise(authClient.admin.impersonateUser({ userId: user.id }), {
          error: "Error al suplantar usuario.",
          loading: "Suplantando usuario...",
          success: "Suplantando usuario.",
        })
        .unwrap();
      window.location.href = "/";
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      cancelText: "Cancelar",
      confirmText: "Eliminar",
      description: `¿Estás seguro de que quieres eliminar a ${user.name} (${user.email})? Esta acción no se puede deshacer.`,
      title: "Eliminar Usuario",
    });

    if (confirmed) {
      await toast
        .promise(authClient.admin.removeUser({ userId: user.id }), {
          error: "Error al eliminar usuario.",
          loading: "Eliminando usuario...",
          success: "Usuario eliminado.",
        })
        .unwrap();
      onRefresh();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
          Acciones
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRoleOpen(true)}>
            Cambiar Rol
          </DropdownMenuItem>
          {user.banned ? (
            <DropdownMenuItem onClick={handleUnban}>Desbanear</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setBanOpen(true)}>
              Banear
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            Cambiar Contraseña
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRevokeSessions}>
            Revocar Sesiones
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleImpersonate}>
            Suplantar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} variant="destructive">
            Eliminar Usuario
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SetRoleDialog
        onOpenChange={setRoleOpen}
        onSuccess={onRefresh}
        open={roleOpen}
        user={user}
      />
      <BanUserDialog
        onOpenChange={setBanOpen}
        onSuccess={onRefresh}
        open={banOpen}
        user={user}
      />
      <SetPasswordDialog
        onOpenChange={setPasswordOpen}
        onSuccess={onRefresh}
        open={passwordOpen}
        user={user}
      />
    </>
  );
}
