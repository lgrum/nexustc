import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { type ComponentProps, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProfileAssetInput } from "@/components/admin/profile-asset-input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ColorPickerField } from "@/components/ui/color-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient } from "@/lib/orpc";

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
  priority: number;
  isVisible: boolean;
  visualConfig: {
    glowColor: string | null;
    backgroundColor: string | null;
  };
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
  priority: number;
  isVisible: boolean;
  glowColor: string | null;
  backgroundColor: string | null;
};

const defaultRoleState = (): RoleFormState => ({
  slug: "",
  name: "",
  description: "",
  iconAssetId: null,
  iconObjectKey: null,
  overlayAssetId: null,
  overlayObjectKey: null,
  priority: 0,
  isVisible: true,
  isExclusive: false,
  baseColor: "#111827",
  accentColor: "#1d4ed8",
  textColor: "#f8fafc",
  glowColor: "#60a5fa",
});

const defaultEmblemState = (): EmblemFormState => ({
  slug: "",
  name: "",
  tooltip: "",
  iconAssetId: null,
  iconObjectKey: null,
  priority: 0,
  isVisible: true,
  glowColor: "#f59e0b",
  backgroundColor: "#111827",
});

function mapRole(role: RoleDefinitionListItem): RoleFormState {
  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    description: role.description,
    iconAssetId: role.iconAssetId ?? null,
    iconObjectKey: role.iconAsset?.objectKey ?? null,
    overlayAssetId: role.overlayAssetId ?? null,
    overlayObjectKey: role.overlayAsset?.objectKey ?? null,
    priority: role.priority,
    isVisible: role.isVisible,
    isExclusive: role.isExclusive,
    baseColor: role.visualConfig.baseColor,
    accentColor: role.visualConfig.accentColor,
    textColor: role.visualConfig.textColor,
    glowColor: role.visualConfig.glowColor,
  };
}

function mapEmblem(emblem: EmblemDefinitionListItem): EmblemFormState {
  return {
    id: emblem.id,
    slug: emblem.slug,
    name: emblem.name,
    tooltip: emblem.tooltip,
    iconAssetId: emblem.iconAssetId ?? null,
    iconObjectKey: emblem.iconAsset?.objectKey ?? null,
    priority: emblem.priority,
    isVisible: emblem.isVisible,
    glowColor: emblem.visualConfig.glowColor,
    backgroundColor: emblem.visualConfig.backgroundColor,
  };
}

export function ProfileAdminPage() {
  const queryClient = useQueryClient();
  const rolesQuery = useSuspenseQuery(
    orpc.profileAdmin.roles.list.queryOptions()
  );
  const emblemsQuery = useSuspenseQuery(
    orpc.profileAdmin.emblems.list.queryOptions()
  );
  const systemConfigQuery = useSuspenseQuery(
    orpc.profileAdmin.systemConfig.get.queryOptions()
  );
  const usersQuery = useQuery({
    queryKey: ["owner-users"],
    queryFn: async () => {
      const result = await authClient.admin.listUsers({
        query: { limit: 200, offset: 0 },
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return result.data.users;
    },
  });

  const [selectedUserId, setSelectedUserId] = useState("");
  const assignmentsQuery = useQuery({
    ...orpc.profileAdmin.assignments.getUserAssignments.queryOptions({
      input: { userId: selectedUserId || "pending" },
    }),
    enabled: selectedUserId.length > 0,
  });
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [emblemIds, setEmblemIds] = useState<string[]>([]);
  const [maxVisibleEmblems, setMaxVisibleEmblems] = useState(
    systemConfigQuery.data.maxVisibleEmblems
  );

  useEffect(() => {
    setMaxVisibleEmblems(systemConfigQuery.data.maxVisibleEmblems);
  }, [systemConfigQuery.data.maxVisibleEmblems]);

  useEffect(() => {
    setRoleIds(assignmentsQuery.data?.roleIds ?? []);
    setEmblemIds(assignmentsQuery.data?.emblemIds ?? []);
  }, [assignmentsQuery.data?.emblemIds, assignmentsQuery.data?.roleIds]);

  const invalidateAll = async () => {
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

  const assignmentsMutation = useMutation({
    mutationFn: () =>
      orpcClient.profileAdmin.assignments.setUserAssignments({
        userId: selectedUserId,
        roleIds,
        emblemIds,
      }),
    onSuccess: () => toast.success("Asignaciones guardadas"),
  });

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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-black text-3xl">Profile Admin</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona badges, emblemas y asignaciones visuales sin tocar codigo.
        </p>
      </div>

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
            onChange={(event) =>
              setMaxVisibleEmblems(Number(event.target.value))
            }
            type="number"
            value={maxVisibleEmblems}
          />
          <Button onClick={() => systemConfigMutation.mutate()}>Guardar</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="roles">
        <TabsList className="w-full">
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="emblems">Emblemas</TabsTrigger>
          <TabsTrigger value="assignments">Asignaciones</TabsTrigger>
        </TabsList>
        <TabsContent className="flex flex-col gap-4" value="roles">
          <RoleEditorCard
            initial={defaultRoleState()}
            mode="create"
            onSaved={invalidateAll}
          />
          {rolesQuery.data.map((role) => (
            <RoleEditorCard
              initial={mapRole(role as RoleDefinitionListItem)}
              key={role.id}
              mode="update"
              onDeleted={invalidateAll}
              onSaved={invalidateAll}
            />
          ))}
        </TabsContent>
        <TabsContent className="flex flex-col gap-4" value="emblems">
          <EmblemEditorCard
            initial={defaultEmblemState()}
            mode="create"
            onSaved={invalidateAll}
          />
          {emblemsQuery.data.map((emblem) => (
            <EmblemEditorCard
              initial={mapEmblem(emblem as EmblemDefinitionListItem)}
              key={emblem.id}
              mode="update"
              onDeleted={invalidateAll}
              onSaved={invalidateAll}
            />
          ))}
        </TabsContent>
        <TabsContent value="assignments">
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
                  {usersQuery.data?.map((currentUser) => (
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
                      {rolesQuery.data.map((role) => (
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
                      {emblemsQuery.data.map((emblem) => (
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoleEditorCard({
  initial,
  mode,
  onSaved,
  onDeleted,
}: {
  initial: RoleFormState;
  mode: "create" | "update";
  onSaved: () => Promise<void> | void;
  onDeleted?: () => Promise<void> | void;
}) {
  const [state, setState] = useState(initial);
  const fieldPrefix = state.id ?? `${mode}-role`;

  useEffect(() => {
    setState(initial);
  }, [initial]);

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

  const deleteMutation = useMutation({
    mutationFn: () => orpcClient.profileAdmin.roles.delete({ id: state.id! }),
    onSuccess: async () => {
      await onDeleted?.();
      toast.success("Rol archivado");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Crear rol" : state.name}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
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
            <Button
              onClick={() => deleteMutation.mutate()}
              variant="destructive"
            >
              Archivar
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EmblemEditorCard({
  initial,
  mode,
  onSaved,
  onDeleted,
}: {
  initial: EmblemFormState;
  mode: "create" | "update";
  onSaved: () => Promise<void> | void;
  onDeleted?: () => Promise<void> | void;
}) {
  const [state, setState] = useState(initial);
  const fieldPrefix = state.id ?? `${mode}-emblem`;

  useEffect(() => {
    setState(initial);
  }, [initial]);

  const saveMutation = useMutation({
    mutationFn: () =>
      mode === "create"
        ? orpcClient.profileAdmin.emblems.create(state)
        : orpcClient.profileAdmin.emblems.update({ id: state.id!, ...state }),
    onSuccess: async () => {
      await onSaved();
      toast.success(
        mode === "create" ? "Emblema creado" : "Emblema actualizado"
      );
      if (mode === "create") {
        setState(defaultEmblemState());
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => orpcClient.profileAdmin.emblems.delete({ id: state.id! }),
    onSuccess: async () => {
      await onDeleted?.();
      toast.success("Emblema archivado");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "create" ? "Crear emblema" : state.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <InputField
          id={`emblem-${fieldPrefix}-slug`}
          label="Slug"
          onChange={(event) =>
            setState((current) => ({ ...current, slug: event.target.value }))
          }
          value={state.slug}
        />
        <InputField
          id={`emblem-${fieldPrefix}-name`}
          label="Nombre"
          onChange={(event) =>
            setState((current) => ({ ...current, name: event.target.value }))
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
        <ColorField
          id={`emblem-${fieldPrefix}-glow-color`}
          label="Glow"
          onChange={(value) =>
            setState((current) => ({ ...current, glowColor: value }))
          }
          value={state.glowColor ?? "#f59e0b"}
        />
        <ColorField
          id={`emblem-${fieldPrefix}-background-color`}
          label="Fondo"
          onChange={(value) =>
            setState((current) => ({ ...current, backgroundColor: value }))
          }
          value={state.backgroundColor ?? "#111827"}
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
          slot="emblem-icon"
        />
        <div className="flex gap-2 md:col-span-2">
          <Button onClick={() => saveMutation.mutate()}>
            {mode === "create" ? "Crear" : "Guardar"}
          </Button>
          {mode === "update" ? (
            <Button
              onClick={() => deleteMutation.mutate()}
              variant="destructive"
            >
              Archivar
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
