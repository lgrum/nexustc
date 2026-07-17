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

test("server oRPC client keeps cached calls public and live calls request-bound", () => {
  const source = read("src/lib/orpc.server.ts");

  expect(source).toContain("cache ? createPublicContext()");
  expect(source).toContain(": await createContext(await headers())");
});

test("VIP feed stays request-bound", () => {
  const source = read("src/app/(main)/vip/page.tsx");
  const clientSource = read("src/app/(main)/vip/vip-client.tsx");

  expect(source).not.toContain('"use cache"');
  expect(source).not.toContain("context: { cache: true }");
  expect(source).toContain("await orpcClient.post.getVipFeed({ page })");
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
