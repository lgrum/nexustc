import type { Permissions, Role } from "@repo/shared/permissions";
import type { AtLeastOne } from "@repo/shared/types";

import { authClient } from "@/lib/auth-client";

export function HasPermissions({
  children,
  permissions,
}: React.PropsWithChildren<{ permissions: AtLeastOne<Permissions> }>) {
  const { data: auth } = authClient.useSession();

  if (!auth?.session) {
    return null;
  }

  const role = auth.user.role as Role | undefined;

  if (!role) {
    return null;
  }

  if (authClient.admin.checkRolePermission({ permissions, role })) {
    return children;
  }

  return null;
}

export function HasOwner({ children }: React.PropsWithChildren) {
  const { data: auth } = authClient.useSession();

  if (auth?.user.role !== "owner") {
    return null;
  }

  return children;
}
