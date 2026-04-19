import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements,
  chronos: ["view", "update"],
  comics: ["create", "update", "delete", "list"],
  creators: ["create", "update", "delete", "list"],
  comments: ["create", "self-update", "self-delete", "update", "delete", "pin"],
  dashboard: ["view"],
  emojis: ["create", "update", "delete", "list"],
  files: ["upload"],
  media: ["list"],
  moderation: ["create", "update", "delete", "list"],
  notifications: ["create", "update", "delete", "list"],
  posts: ["create", "update", "delete", "list"],
  ratings: ["create", "self-update", "self-delete", "delete", "pin"],
  shortener: ["use"],
  staticPages: ["update"],
  stickers: ["create", "update", "delete", "list"],
  terms: ["create", "update", "delete", "list"],
} as const;

export const ac = createAccessControl(statement);

const user = ac.newRole({
  comments: ["create", "self-update", "self-delete"],
  ratings: ["create", "self-update", "self-delete"],
});

const shortener = ac.newRole({
  dashboard: ["view"],
  shortener: ["use"],
});

const uploader = ac.newRole({
  comics: ["create", "list"],
  comments: ["create", "self-update", "self-delete"],
  creators: ["create", "list"],
  dashboard: ["view"],
  files: ["upload"],
  media: ["list"],
  posts: ["create", "list"],
  ratings: ["create", "self-update", "self-delete"],
  shortener: ["use"],
});

const moderator = ac.newRole({
  comics: ["create", "list", "update", "delete"],
  dashboard: ["view"],
  files: ["upload"],
  media: ["list"],
  notifications: ["create", "update", "delete", "list"],
  ratings: ["create", "self-update", "self-delete", "delete"],
});

const admin = ac.newRole({
  chronos: ["view", "update"],
  comics: ["create", "list", "update", "delete"],
  creators: ["create", "list", "update", "delete"],
  dashboard: ["view"],
  emojis: ["create", "update", "delete", "list"],
  files: ["upload"],
  media: ["list"],
  moderation: ["create", "update", "delete", "list"],
  notifications: ["create", "update", "delete", "list"],
  posts: ["create", "list", "update", "delete"],
  comments: ["pin"],
  ratings: ["create", "self-update", "self-delete", "delete", "pin"],
  shortener: ["use"],
  stickers: ["create", "update", "delete", "list"],
  terms: ["create", "list", "update", "delete"],
  user: ["create", "set-role"],
});

const owner = ac.newRole({
  ...adminAc.statements,
  chronos: ["view", "update"],
  comics: ["create", "list", "update", "delete"],
  creators: ["create", "list", "update", "delete"],
  dashboard: ["view"],
  emojis: ["create", "update", "delete", "list"],
  files: ["upload"],
  media: ["list"],
  moderation: ["create", "update", "delete", "list"],
  notifications: ["create", "update", "delete", "list"],
  posts: ["create", "list", "update", "delete"],
  comments: ["create", "self-update", "self-delete", "update", "delete", "pin"],
  ratings: ["create", "self-update", "self-delete", "delete", "pin"],
  shortener: ["use"],
  staticPages: ["update"],
  stickers: ["create", "update", "delete", "list"],
  terms: ["create", "list", "update", "delete"],
});

export const roles = {
  admin,
  moderator,
  owner,
  shortener,
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
  "shortener",
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
