import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf-8");
}

test("home data keeps recent users request-bound", () => {
  const source = read("src/app/(main)/page.tsx");

  expect(source).toContain('"use cache"');
  expect(source).toContain('cacheTag("home")');
  expect(source.match(/context: \{ cache: true \}/g)).toHaveLength(2);
  expect(source).toContain("await orpcClient.user.getRecentUsers()");
});

test("authenticated catalog fetches bypass anonymous cache context", () => {
  const source = read("src/app/(main)/comics/page.tsx");

  expect(source).toContain("auth.api.getSession");
  expect(source).toContain("if (!session)");
  expect(source).toContain("{ context: { cache: true } }");
  expect(source).toContain("await orpcClient.post.search({");
});

test("public streak resolution stays outside the hours-cached profile", () => {
  const source = read("src/app/(main)/user/[id]/page.tsx");
  const cachedProfile = source.slice(
    source.indexOf("async function getProfile"),
    source.indexOf("export async function generateMetadata")
  );
  const page = source.slice(
    source.indexOf("export default async function Page")
  );

  expect(cachedProfile).toContain("includeCurrentStreak: false");
  expect(cachedProfile).toContain("orpcClient.profile.getPublic(");
  expect(cachedProfile).toContain("context: { cache: true }");
  expect(cachedProfile).not.toContain("getPublicCurrentStreak");
  expect(page).toContain("orpcClient.profile.getPublicCurrentStreak({");
  expect(source).not.toContain("@repo/api/services/profile");
  expect(source).not.toContain('from "@repo/db"');
});

test("server oRPC client keeps cached calls public and live calls request-bound", () => {
  const source = read("src/lib/orpc.server.ts");

  expect(source).toContain("cache ? createPublicContext()");
  expect(source).toContain(": await createContext(await headers())");
});

test("the Better Auth route composes account closure with economy reconciliation", () => {
  const source = read("src/app/api/auth/[...auth]/route.ts");

  expect(source).toContain('import "@/lib/account-closure.server"');
});

test("manual unbans use the reward-restoring API boundary", () => {
  const source = read("src/components/admin/users/user-actions-dropdown.tsx");

  expect(source).toContain("orpcClient.user.admin.unbanUser");
  expect(source).not.toContain("authClient.admin.unbanUser");
});

test("VIP feed stays request-bound", () => {
  const source = read("src/app/(main)/vip/page.tsx");
  const clientSource = read("src/app/(main)/vip/vip-client.tsx");

  expect(source).not.toContain('"use cache"');
  expect(source).not.toContain("context: { cache: true }");
  expect(source).toContain(
    "await orpcClient.post.getVipFeed({ page, type: contentType })"
  );
  expect(source).toContain('return type === "comic" ? "comic" : "post"');
  expect(clientSource).toContain(
    "item.imageObjectKeys?.[0] ?? item.coverImageObjectKey"
  );
});

test("root layout keeps expected hydration mismatch suppression", () => {
  const source = read("src/app/layout.tsx");

  expect(source).toContain("suppressHydrationWarning");
});

test("admin shell leaves route loading to the admin segment", () => {
  const source = read("src/app/admin/admin-shell.tsx");

  expect(source).not.toContain(
    "<Suspense fallback={<Loader />}>{children}</Suspense>"
  );
  expect(source).toMatch(/<ImpersonationBanner \/>\s*\{children\}/);
});

test("tracked post cards render on the client", () => {
  const source = read("src/components/landing/post-card.tsx");

  expect(source.trimStart()).toMatch(/^"use client";/);
  expect(source).toContain('trackEvent("content_card_clicked"');
});

test("comic creator page wrapper renders on the client", () => {
  const source = read(
    "src/app/(main)/comic-creator/[id]/comic-creator-client.tsx"
  );

  expect(source.trimStart()).toMatch(/^"use client";/);
  expect(source).toContain('render={<Link href="/comics" />}');
});
