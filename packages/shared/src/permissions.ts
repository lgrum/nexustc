import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements,
  chronos: ["view", "update"],
  comics: ["create", "update", "delete", "list"],
  comments: ["create", "self-update", "self-delete", "update", "delete"],
  dashboard: ["view"],
  emojis: ["create", "update", "delete", "list"],
  files: ["upload"],
  posts: ["create", "update", "delete", "list"],
  ratings: ["create", "self-update", "self-delete", "delete"],
  staticPages: ["update"],
  stickers: ["create", "update", "delete", "list"],
  terms: ["create", "update", "delete", "list"],
} as const;

export const ac = createAccessControl(statement);

const user = ac.newRole({
  comments: ["create", "self-update", "self-delete"],
  ratings: ["create", "self-update", "self-delete"],
});

const uploader = ac.newRole({
  comics: ["create", "list"],
  comments: ["create", "self-update", "self-delete"],
  dashboard: ["view"],
  files: ["upload"],
  posts: ["create", "list"],
  ratings: ["create", "self-update", "self-delete"],
});

const moderator = ac.newRole({
  comics: ["create", "list", "update", "delete"],
  dashboard: ["view"],
  files: ["upload"],
  ratings: ["create", "self-update", "self-delete", "delete"],
});

const admin = ac.newRole({
  chronos: ["view", "update"],
  comics: ["create", "list", "update", "delete"],
  dashboard: ["view"],
  emojis: ["create", "update", "delete", "list"],
  files: ["upload"],
  posts: ["create", "list", "update", "delete"],
  ratings: ["create", "self-update", "self-delete", "delete"],
  stickers: ["create", "update", "delete", "list"],
  terms: ["create", "list", "update", "delete"],
  user: ["create", "set-role"],
});

const owner = ac.newRole({
  ...adminAc.statements,
  chronos: ["view", "update"],
  comics: ["create", "list", "update", "delete"],
  dashboard: ["view"],
  emojis: ["create", "update", "delete", "list"],
  files: ["upload"],
  posts: ["create", "list", "update", "delete"],
  ratings: ["create", "self-update", "self-delete", "delete"],
  staticPages: ["update"],
  stickers: ["create", "update", "delete", "list"],
  terms: ["create", "list", "update", "delete"],
});

export const roles = {
  admin,
  moderator,
  owner,
  uploader,
  user,
};

type Statement = typeof statement;

type PermissionMap = {
  [K in keyof Statement]: Statement[K][number];
};

export type Permissions = {
  [K in keyof PermissionMap]?: PermissionMap[K][];
};

export type Role = keyof typeof roles;

export const ROLE_HIERARCHY: Role[] = [
  "user",
  "uploader",
  "moderator",
  "admin",
  "owner",
];

export function getRoleLevel(role: Role): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function getAllowedRoles(actorRole: Role): Role[] {
  const level = getRoleLevel(actorRole);
  return ROLE_HIERARCHY.filter((_, i) => i < level);
}
