import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { toast } from "sonner";
import z from "zod";

import { DataTable } from "@/components/admin/data-table";
import { ProfileAssetInput } from "@/components/admin/profile-asset-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ColorPickerField } from "@/components/ui/color-picker-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppForm } from "@/hooks/use-app-form";
import { authClient } from "@/lib/auth-client";
import {
  createDeferredMediaSelectionFromExistingId,
  createEmptyDeferredMediaSelection,
  optionalSingleDeferredMediaSelectionSchema,
} from "@/lib/deferred-media";
import type { DeferredMediaSelection } from "@/lib/deferred-media";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

type ProfileAssetPreview = {
  objectKey: string;
};

type RoleDefinitionListItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconAssetId: string | null;
  iconAsset: ProfileAssetPreview | null;
  overlayAssetId: string | null;
  overlayAsset: ProfileAssetPreview | null;
  priority: number;
  isVisible: boolean;
  isExclusive: boolean;
  visualConfig: {
    baseColor: string;
    accentColor: string | null;
    textColor: string;
    glowColor: string | null;
  };
};

type EmblemDefinitionListItem = {
  id: string;
  slug: string;
  name: string;
  tooltip: string;
  iconAssetId: string | null;
  iconAsset: ProfileAssetPreview | null;
  iconMediaId: string | null;
  priority: number;
  isVisible: boolean;
};

type ProfileAdminUser = {
  id: string;
  email: string;
};

type RoleFormState = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  iconAssetId: string | null;
  iconObjectKey: string | null;
  overlayAssetId: string | null;
  overlayObjectKey: string | null;
  priority: number;
  isVisible: boolean;
  isExclusive: boolean;
  baseColor: string;
  accentColor: string | null;
  textColor: string;
  glowColor: string | null;
};

type EmblemFormState = {
  id?: string;
  slug: string;
  name: string;
  tooltip: string;
  iconAssetId: string | null;
  iconObjectKey: string | null;
  iconMediaId: string | null;
  mediaSelection: DeferredMediaSelection;
  priority: number;
  isVisible: boolean;
};

const defaultRoleState = (): RoleFormState => ({
  accentColor: "#1d4ed8",
  baseColor: "#111827",
  description: "",
  glowColor: "#60a5fa",
  iconAssetId: null,
  iconObjectKey: null,
  isExclusive: false,
  isVisible: true,
  name: "",
  overlayAssetId: null,
  overlayObjectKey: null,
  priority: 0,
  slug: "",
  textColor: "#f8fafc",
});

const defaultEmblemState = (): EmblemFormState => ({
  iconAssetId: null,
  iconMediaId: null,
  iconObjectKey: null,
  isVisible: true,
  mediaSelection: createEmptyDeferredMediaSelection(),
  name: "",
  priority: 0,
  slug: "",
  tooltip: "",
});

function mapRole(role: RoleDefinitionListItem): RoleFormState {
  return {
    accentColor: role.visualConfig.accentColor,
    baseColor: role.visualConfig.baseColor,
    description: role.description,
    glowColor: role.visualConfig.glowColor,
    iconAssetId: role.iconAssetId ?? null,
    iconObjectKey: role.iconAsset?.objectKey ?? null,
    id: role.id,
    isExclusive: role.isExclusive,
    isVisible: role.isVisible,
    name: role.name,
    overlayAssetId: role.overlayAssetId ?? null,
    overlayObjectKey: role.overlayAsset?.objectKey ?? null,
    priority: role.priority,
    slug: role.slug,
    textColor: role.visualConfig.textColor,
  };
}

function mapEmblem(emblem: EmblemDefinitionListItem): EmblemFormState {
  return {
    iconAssetId: emblem.iconAssetId ?? null,
    iconMediaId: emblem.iconMediaId ?? null,
    iconObjectKey: emblem.iconAsset?.objectKey ?? null,
    id: emblem.id,
    isVisible: emblem.isVisible,
    mediaSelection: createDeferredMediaSelectionFromExistingId(
      emblem.iconMediaId
    ),
    name: emblem.name,
    priority: emblem.priority,
    slug: emblem.slug,
    tooltip: emblem.tooltip,
  };
}

const emblemMediaFormSchema = z.object({
  mediaSelection: optionalSingleDeferredMediaSelectionSchema,
});

function useOwnerUsersQuery() {
  return useQuery({
    queryFn: async (): Promise<ProfileAdminUser[]> => {
      const result = await authClient.admin.listUsers({
        query: { limit: 200, offset: 0 },
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return result.data.users.map((user) => ({
        email: user.email,
        id: user.id,
      }));
    },
    queryKey: ["owner-users"],
  });
}

function useInvalidateProfileAdmin() {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries(
        orpc.profileAdmin.roles.list.queryOptions()
      ),
      queryClient.invalidateQueries(
        orpc.profileAdmin.emblems.list.queryOptions()
      ),
      queryClient.invalidateQueries(
        orpc.profileAdmin.systemConfig.get.queryOptions()
      ),
      queryClient.invalidateQueries({ queryKey: ["owner-users"] }),
      queryClient.invalidateQueries({ queryKey: ["ratings"] }),
      queryClient.invalidateQueries({ queryKey: ["comments"] }),
    ]);
  };
}

function PageHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h1 className="font-black text-3xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function AssetPreview({
  alt,
  objectKey,
}: {
  alt: string;
  objectKey: string | null | undefined;
}) {
  if (!objectKey) {
    return <span className="text-muted-foreground text-xs">Sin icono</span>;
  }

  return (
    <img
      alt={alt}
      className="size-10 rounded-md object-contain"
      src={getBucketUrl(objectKey)}
    />
  );
}

function ProfileSystemConfigCard() {
  const queryClient = useQueryClient();
  const systemConfigQuery = useSuspenseQuery(
    orpc.profileAdmin.systemConfig.get.queryOptions()
  );
  const [maxVisibleEmblems, setMaxVisibleEmblems] = useState(
    systemConfigQuery.data.maxVisibleEmblems
  );

  useEffect(() => {
    setMaxVisibleEmblems(systemConfigQuery.data.maxVisibleEmblems);
  }, [systemConfigQuery.data.maxVisibleEmblems]);

  const systemConfigMutation = useMutation({
    mutationFn: () =>
      orpcClient.profileAdmin.systemConfig.update({ maxVisibleEmblems }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(
        orpc.profileAdmin.systemConfig.get.queryOptions()
      );
      toast.success("Configuracion actualizada");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuracion Global</CardTitle>
        <CardDescription>
          Ajusta limites de render del perfil publico.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <InputField
          className="flex-1"
          id="profile-system-max-visible-emblems"
          label="Emblemas visibles"
          min={1}
          onChange={(event) => setMaxVisibleEmblems(Number(event.target.value))}
          type="number"
          value={maxVisibleEmblems}
        />
        <Button onClick={() => systemConfigMutation.mutate()}>Guardar</Button>
      </CardContent>
    </Card>
  );
}

function ProfileRolesSection({ roles }: { roles: RoleDefinitionListItem[] }) {
  const confirm = useConfirm();
  const invalidateProfileAdmin = useInvalidateProfileAdmin();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const columns: ColumnDef<RoleDefinitionListItem>[] = [
    {
      accessorKey: "iconAsset",
      cell: (info) => (
        <AssetPreview
          alt={info.row.original.name}
          objectKey={info.row.original.iconAsset?.objectKey}
        />
      ),
      header: "Icono",
    },
    { accessorKey: "name", header: "Nombre" },
    { accessorKey: "slug", header: "Slug" },
    {
      accessorKey: "description",
      cell: (info) => (
        <div className="max-w-md text-sm text-muted-foreground">
          {info.row.original.description || "Sin descripcion"}
        </div>
      ),
      header: "Descripcion",
    },
    { accessorKey: "priority", header: "Prioridad" },
    {
      accessorKey: "isVisible",
      cell: (info) => (info.row.original.isVisible ? "Si" : "No"),
      header: "Visible",
    },
    {
      accessorKey: "isExclusive",
      cell: (info) => (info.row.original.isExclusive ? "Si" : "No"),
      header: "Exclusivo",
    },
    {
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setSelectedRoleId(info.row.original.id)}
            variant="outline"
          >
            Editar
          </Button>
          <Button
            onClick={async () => {
              const isConfirmed = await confirm({
                cancelText: "Cancelar",
                confirmText: "Eliminar",
                description:
                  "Estas absolutamente seguro de que quieres eliminar este rol? Esta accion no se puede deshacer.",
                title: "Eliminar Rol",
              });

              if (isConfirmed) {
                await toast
                  .promise(
                    orpcClient.profileAdmin.roles.delete({
                      id: info.row.original.id,
                    }),
                    {
                      error: (error) => ({
                        duration: 10_000,
                        message: `Error al eliminar rol: ${error}`,
                      }),
                      loading: "Eliminando rol...",
                      success: "Rol eliminado.",
                    }
                  )
                  .unwrap();

                if (selectedRoleId === info.row.original.id) {
                  setSelectedRoleId(null);
                }

                await invalidateProfileAdmin();
              }
            }}
            size="icon"
            variant="destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </div>
      ),
      header: "Acciones",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <RoleEditorCard
        initial={selectedRole ? mapRole(selectedRole) : defaultRoleState()}
        key={selectedRole?.id ?? "create-role"}
        mode={selectedRole ? "update" : "create"}
        onCancel={() => setSelectedRoleId(null)}
        onSaved={async () => {
          await invalidateProfileAdmin();
          setSelectedRoleId(null);
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>Roles existentes</CardTitle>
          <CardDescription>
            Edita un rol desde la tabla o eliminalo de forma permanente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={roles} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileEmblemsSection({
  emblems,
}: {
  emblems: EmblemDefinitionListItem[];
}) {
  const confirm = useConfirm();
  const invalidateProfileAdmin = useInvalidateProfileAdmin();
  const [selectedEmblemId, setSelectedEmblemId] = useState<string | null>(null);

  const selectedEmblem = emblems.find(
    (emblem) => emblem.id === selectedEmblemId
  );
  const columns: ColumnDef<EmblemDefinitionListItem>[] = [
    {
      accessorKey: "iconAsset",
      cell: (info) => (
        <AssetPreview
          alt={info.row.original.name}
          objectKey={info.row.original.iconAsset?.objectKey}
        />
      ),
      header: "Icono",
    },
    { accessorKey: "name", header: "Nombre" },
    { accessorKey: "slug", header: "Slug" },
    {
      accessorKey: "tooltip",
      cell: (info) => (
        <div className="max-w-md text-sm text-muted-foreground">
          {info.row.original.tooltip || "Sin tooltip"}
        </div>
      ),
      header: "Tooltip",
    },
    { accessorKey: "priority", header: "Prioridad" },
    {
      accessorKey: "isVisible",
      cell: (info) => (info.row.original.isVisible ? "Si" : "No"),
      header: "Visible",
    },
    {
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setSelectedEmblemId(info.row.original.id)}
            variant="outline"
          >
            Editar
          </Button>
          <Button
            onClick={async () => {
              const isConfirmed = await confirm({
                cancelText: "Cancelar",
                confirmText: "Eliminar",
                description:
                  "Estas absolutamente seguro de que quieres eliminar este emblema? Esta accion no se puede deshacer.",
                title: "Eliminar Emblema",
              });

              if (isConfirmed) {
                await toast
                  .promise(
                    orpcClient.profileAdmin.emblems.delete({
                      id: info.row.original.id,
                    }),
                    {
                      error: (error) => ({
                        duration: 10_000,
                        message: `Error al eliminar emblema: ${error}`,
                      }),
                      loading: "Eliminando emblema...",
                      success: "Emblema eliminado.",
                    }
                  )
                  .unwrap();

                if (selectedEmblemId === info.row.original.id) {
                  setSelectedEmblemId(null);
                }

                await invalidateProfileAdmin();
              }
            }}
            size="icon"
            variant="destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </div>
      ),
      header: "Acciones",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <EmblemEditorCard
        initial={
          selectedEmblem ? mapEmblem(selectedEmblem) : defaultEmblemState()
        }
        key={selectedEmblem?.id ?? "create-emblem"}
        mode={selectedEmblem ? "update" : "create"}
        onCancel={() => setSelectedEmblemId(null)}
        onSaved={async () => {
          await invalidateProfileAdmin();
          setSelectedEmblemId(null);
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>Emblemas existentes</CardTitle>
          <CardDescription>
            Edita un emblema desde la tabla o eliminalo de forma permanente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={emblems} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileAssignmentsCard({
  emblems,
  roles,
  users,
}: {
  emblems: EmblemDefinitionListItem[];
  roles: RoleDefinitionListItem[];
  users: ProfileAdminUser[] | undefined;
}) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [emblemIds, setEmblemIds] = useState<string[]>([]);

  const assignmentsQuery = useQuery({
    ...orpc.profileAdmin.assignments.getUserAssignments.queryOptions({
      input: { userId: selectedUserId || "pending" },
    }),
    enabled: selectedUserId.length > 0,
  });

  useEffect(() => {
    setRoleIds(assignmentsQuery.data?.roleIds ?? []);
    setEmblemIds(assignmentsQuery.data?.emblemIds ?? []);
  }, [assignmentsQuery.data?.emblemIds, assignmentsQuery.data?.roleIds]);

  const assignmentsMutation = useMutation({
    mutationFn: () =>
      orpcClient.profileAdmin.assignments.setUserAssignments({
        emblemIds,
        roleIds,
        userId: selectedUserId,
      }),
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar las asignaciones."
      ),
    onSuccess: () => toast.success("Asignaciones guardadas"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asignaciones</CardTitle>
        <CardDescription>
          Selecciona un usuario y define sus roles/emblemas visibles.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm">
          <label htmlFor="profile-assignments-user">Usuario</label>
          <select
            className="h-11 rounded-xl border border-input bg-background px-3"
            id="profile-assignments-user"
            onChange={(event) => setSelectedUserId(event.target.value)}
            value={selectedUserId}
          >
            <option value="">Selecciona un usuario</option>
            {users?.map((currentUser) => (
              <option key={currentUser.id} value={currentUser.id}>
                {currentUser.email}
              </option>
            ))}
          </select>
        </div>

        {selectedUserId ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="font-semibold">Roles</p>
                {roles.map((role) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={role.id}
                  >
                    <input
                      checked={roleIds.includes(role.id)}
                      onChange={(event) =>
                        setRoleIds((current) =>
                          event.target.checked
                            ? [...current, role.id]
                            : current.filter((id) => id !== role.id)
                        )
                      }
                      type="checkbox"
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-semibold">Emblemas</p>
                {emblems.map((emblem) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={emblem.id}
                  >
                    <input
                      checked={emblemIds.includes(emblem.id)}
                      onChange={(event) =>
                        setEmblemIds((current) =>
                          event.target.checked
                            ? [...current, emblem.id]
                            : current.filter((id) => id !== emblem.id)
                        )
                      }
                      type="checkbox"
                    />
                    {emblem.name}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={() => assignmentsMutation.mutate()}>
              Guardar asignaciones
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProfileAdminPage() {
  const rolesQuery = useSuspenseQuery(
    orpc.profileAdmin.roles.list.queryOptions()
  );
  const emblemsQuery = useSuspenseQuery(
    orpc.profileAdmin.emblems.list.queryOptions()
  );
  const usersQuery = useOwnerUsersQuery();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        description="Gestiona badges, emblemas y asignaciones visuales sin tocar codigo."
        title="Profile Admin"
      />
      <ProfileSystemConfigCard />
      <ProfileAssignmentsCard
        emblems={emblemsQuery.data as EmblemDefinitionListItem[]}
        roles={rolesQuery.data as RoleDefinitionListItem[]}
        users={usersQuery.data}
      />
    </div>
  );
}

export function ProfileRolesAdminPage() {
  const rolesQuery = useSuspenseQuery(
    orpc.profileAdmin.roles.list.queryOptions()
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        description="Crea y edita los roles visuales disponibles para los perfiles."
        title="Roles de Perfil"
      />
      <ProfileRolesSection
        roles={rolesQuery.data as RoleDefinitionListItem[]}
      />
    </div>
  );
}

export function ProfileEmblemsAdminPage() {
  const emblemsQuery = useSuspenseQuery(
    orpc.profileAdmin.emblems.list.queryOptions()
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        description="Crea y edita los emblemas disponibles para asignar en perfiles."
        title="Emblemas de Perfil"
      />
      <ProfileEmblemsSection
        emblems={emblemsQuery.data as EmblemDefinitionListItem[]}
      />
    </div>
  );
}

function RoleEditorCard({
  initial,
  mode,
  onSaved,
  onCancel,
}: {
  initial: RoleFormState;
  mode: "create" | "update";
  onSaved: () => Promise<void> | void;
  onCancel?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(initial);
  const fieldPrefix = state.id ?? `${mode}-role`;

  useEffect(() => {
    setState(initial);
  }, [initial]);

  useEffect(() => {
    if (mode !== "update") {
      return;
    }

    containerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [initial.id, mode]);

  const saveMutation = useMutation({
    mutationFn: () =>
      mode === "create"
        ? orpcClient.profileAdmin.roles.create(state)
        : orpcClient.profileAdmin.roles.update({ id: state.id!, ...state }),
    onSuccess: async () => {
      await onSaved();
      toast.success(mode === "create" ? "Rol creado" : "Rol actualizado");
      if (mode === "create") {
        setState(defaultRoleState());
      }
    },
  });

  return (
    <div ref={containerRef}>
      <Card
        className={
          mode === "update" ? "border-primary/50 ring-2 ring-primary/20" : ""
        }
      >
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "Crear rol" : `Editar ${state.name}`}
          </CardTitle>
          <CardDescription>
            {mode === "create"
              ? "Completa el formulario para crear un nuevo rol visual."
              : "Actualiza el rol seleccionado o cancela para volver a crear uno nuevo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {mode === "update" ? (
            <Alert className="border-amber-300 bg-amber-50 text-amber-950 md:col-span-2">
              <AlertTitle className="text-amber-950">
                Modo edicion activado
              </AlertTitle>
              <AlertDescription className="text-amber-900/90">
                Estas editando el rol <strong>{state.name}</strong>. Guarda los
                cambios o cancela para volver al formulario de creacion.
              </AlertDescription>
            </Alert>
          ) : null}
          <InputField
            id={`role-${fieldPrefix}-slug`}
            label="Slug"
            onChange={(event) =>
              setState((current) => ({ ...current, slug: event.target.value }))
            }
            value={state.slug}
          />
          <InputField
            id={`role-${fieldPrefix}-name`}
            label="Nombre"
            onChange={(event) =>
              setState((current) => ({ ...current, name: event.target.value }))
            }
            value={state.name}
          />
          <InputField
            className="md:col-span-2"
            id={`role-${fieldPrefix}-description`}
            label="Descripcion"
            onChange={(event) =>
              setState((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            value={state.description}
          />
          <InputField
            id={`role-${fieldPrefix}-priority`}
            label="Prioridad"
            onChange={(event) =>
              setState((current) => ({
                ...current,
                priority: Number(event.target.value),
              }))
            }
            type="number"
            value={state.priority}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={state.isVisible}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    isVisible: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Visible
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={state.isExclusive}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    isExclusive: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Exclusivo
            </label>
          </div>
          <ColorField
            id={`role-${fieldPrefix}-base-color`}
            label="Color base"
            onChange={(value) =>
              setState((current) => ({ ...current, baseColor: value }))
            }
            value={state.baseColor}
          />
          <ColorField
            id={`role-${fieldPrefix}-accent-color`}
            label="Color acento"
            onChange={(value) =>
              setState((current) => ({ ...current, accentColor: value }))
            }
            value={state.accentColor ?? "#1d4ed8"}
          />
          <ColorField
            id={`role-${fieldPrefix}-text-color`}
            label="Color texto"
            onChange={(value) =>
              setState((current) => ({ ...current, textColor: value }))
            }
            value={state.textColor}
          />
          <ColorField
            id={`role-${fieldPrefix}-glow-color`}
            label="Color glow"
            onChange={(value) =>
              setState((current) => ({ ...current, glowColor: value }))
            }
            value={state.glowColor ?? "#60a5fa"}
          />
          <ProfileAssetInput
            currentObjectKey={state.iconObjectKey}
            label="Icono"
            onUploaded={(assetId, objectKey) =>
              setState((current) => ({
                ...current,
                iconAssetId: assetId,
                iconObjectKey: objectKey,
              }))
            }
            slot="role-icon"
          />
          <ProfileAssetInput
            currentObjectKey={state.overlayObjectKey}
            label="Overlay"
            onUploaded={(assetId, objectKey) =>
              setState((current) => ({
                ...current,
                overlayAssetId: assetId,
                overlayObjectKey: objectKey,
              }))
            }
            slot="role-overlay"
          />
          <div className="flex gap-2 md:col-span-2">
            <Button onClick={() => saveMutation.mutate()}>
              {mode === "create" ? "Crear" : "Guardar"}
            </Button>
            {mode === "update" ? (
              <Button onClick={onCancel} variant="outline">
                Cancelar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmblemEditorCard({
  initial,
  mode,
  onSaved,
  onCancel,
}: {
  initial: EmblemFormState;
  mode: "create" | "update";
  onSaved: () => Promise<void> | void;
  onCancel?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(initial);
  const fieldPrefix = state.id ?? `${mode}-emblem`;
  const mediaForm = useAppForm({
    defaultValues: {
      mediaSelection: initial.mediaSelection,
    },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync({
        ...state,
        mediaSelection: value.mediaSelection,
      });
    },
    validators: {
      onSubmit: emblemMediaFormSchema,
    },
  });
  const selectedMedia = useStore(
    mediaForm.store,
    (formState) => formState.values.mediaSelection
  );

  useEffect(() => {
    setState(initial);
  }, [initial]);

  useEffect(() => {
    if (mode !== "update") {
      return;
    }

    containerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [initial.id, mode]);

  const saveMutation = useMutation({
    mutationFn: (
      nextState: EmblemFormState & { mediaSelection: DeferredMediaSelection }
    ) =>
      mode === "create"
        ? orpcClient.profileAdmin.emblems.create(nextState)
        : orpcClient.profileAdmin.emblems.update({
            id: state.id!,
            ...nextState,
          }),
    onSuccess: async () => {
      await onSaved();
      toast.success(
        mode === "create" ? "Emblema creado" : "Emblema actualizado"
      );
      if (mode === "create") {
        setState(defaultEmblemState());
        mediaForm.reset();
      }
    },
  });

  return (
    <div ref={containerRef}>
      <Card
        className={
          mode === "update" ? "border-primary/50 ring-2 ring-primary/20" : ""
        }
      >
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "Crear emblema" : `Editar ${state.name}`}
          </CardTitle>
          <CardDescription>
            {mode === "create"
              ? "Completa el formulario para crear un nuevo emblema solo con icono."
              : "Actualiza el emblema seleccionado o cancela para volver a crear uno nuevo."}
          </CardDescription>
        </CardHeader>
        <mediaForm.AppForm>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {mode === "update" ? (
              <Alert className="border-amber-300 bg-amber-50 text-amber-950 md:col-span-2">
                <AlertTitle className="text-amber-950">
                  Modo edicion activado
                </AlertTitle>
                <AlertDescription className="text-amber-900/90">
                  Estas editando el emblema <strong>{state.name}</strong>.
                  Guarda los cambios o cancela para volver al formulario de
                  creacion.
                </AlertDescription>
              </Alert>
            ) : null}
            <InputField
              id={`emblem-${fieldPrefix}-slug`}
              label="Slug"
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  slug: event.target.value,
                }))
              }
              value={state.slug}
            />
            <InputField
              id={`emblem-${fieldPrefix}-name`}
              label="Nombre"
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              value={state.name}
            />
            <InputField
              className="md:col-span-2"
              id={`emblem-${fieldPrefix}-tooltip`}
              label="Tooltip"
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  tooltip: event.target.value,
                }))
              }
              value={state.tooltip}
            />
            <InputField
              id={`emblem-${fieldPrefix}-priority`}
              label="Prioridad"
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  priority: Number(event.target.value),
                }))
              }
              type="number"
              value={state.priority}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={state.isVisible}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    isVisible: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Visible
            </label>
            <div className="md:col-span-2">
              <mediaForm.AppField name="mediaSelection">
                {(field) => (
                  <field.MediaField
                    description="Selecciona un icono desde la biblioteca central o prepara uno nuevo para subirlo al guardar."
                    label="Icono"
                    maxItems={1}
                    ownerKind="Emblema"
                  />
                )}
              </mediaForm.AppField>
              {state.iconObjectKey &&
              selectedMedia.length === 0 &&
              !state.iconMediaId ? (
                <div className="mt-3 rounded-xl border border-dashed border-border/60 bg-muted/20 p-3">
                  <p className="text-muted-foreground text-xs">
                    Icono actual fuera de la biblioteca central. Puedes dejarlo
                    asi o reemplazarlo con un item de Media.
                  </p>
                  <div className="mt-3 flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-background p-2">
                    <img
                      alt=""
                      aria-hidden="true"
                      className="max-h-full max-w-full object-contain"
                      src={getBucketUrl(state.iconObjectKey)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button
                onClick={() => {
                  mediaForm.handleSubmit();
                }}
                type="button"
              >
                {mode === "create" ? "Crear" : "Guardar"}
              </Button>
              {mode === "update" ? (
                <Button onClick={onCancel} type="button" variant="outline">
                  Cancelar
                </Button>
              ) : null}
            </div>
          </CardContent>
        </mediaForm.AppForm>
      </Card>
    </div>
  );
}

function InputField({
  id,
  label,
  className,
  placeholder,
  ...inputProps
}: {
  id: string;
  label: string;
  className?: string;
} & ComponentProps<typeof Input>) {
  return (
    <div
      className={["flex flex-col gap-2 text-sm", className]
        .filter(Boolean)
        .join(" ")}
    >
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} placeholder={placeholder ?? label} {...inputProps} />
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ColorPickerField id={id} label={label} onChange={onChange} value={value} />
  );
}
