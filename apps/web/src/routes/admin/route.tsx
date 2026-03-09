import { ChevronRight } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Permissions } from "@repo/shared/permissions";
import type { AtLeastOne } from "@repo/shared/types";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { ImpersonationBanner } from "@/components/admin/users/impersonation-banner";
import { HasOwner, HasPermissions } from "@/components/auth/has-role";
import Loader from "@/components/loader";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { adminMiddleware } from "@/middleware/admin";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Admin",
      },
    ],
  }),
  server: {
    middleware: [adminMiddleware],
  },
});

const nav = {
  users: {
    name: "Usuarios",
    links: [
      {
        name: "Listar",
        href: "/admin/users",
      },
      {
        name: "Gestionar",
        href: "/admin/users/manage",
        permissions: { user: ["set-role"] } as AtLeastOne<Permissions>,
      },
    ],
  },
  terms: {
    name: "Términos",
    links: [
      {
        name: "Listar",
        href: "/admin/terms",
      },
      {
        name: "Crear",
        href: "/admin/terms/create",
      },
    ],
  },
  posts: {
    name: "Posts",
    links: [
      {
        name: "Listar",
        href: "/admin/posts",
      },
      {
        name: "Crear",
        href: "/admin/posts/create",
      },
    ],
  },
  comics: {
    name: "Comics",
    links: [
      {
        name: "Listar",
        href: "/admin/comics",
      },
      {
        name: "Crear",
        href: "/admin/comics/create",
      },
    ],
  },
  extras: {
    name: "Extras",
    links: [
      {
        name: "Juegos de la Semana",
        href: "/admin/extras/weekly",
      },
      {
        name: "Posts Destacados",
        href: "/admin/extras/featured",
      },
      {
        name: "Tutoriales",
        href: "/admin/extras/tutorials",
      },
    ],
  },
  chronos: {
    name: "Chronos",
    links: [
      {
        name: "Editar Página",
        href: "/admin/chronos/edit",
      },
    ],
  },
  emojis: {
    name: "Emojis",
    links: [
      {
        name: "Listar",
        href: "/admin/emojis",
      },
      {
        name: "Crear",
        href: "/admin/emojis/create",
      },
    ],
  },
  stickers: {
    name: "Stickers",
    links: [
      {
        name: "Listar",
        href: "/admin/stickers",
      },
      {
        name: "Crear",
        href: "/admin/stickers/create",
      },
    ],
  },
  profile: {
    name: "Perfiles",
    links: [
      {
        name: "Visuales",
        href: "/admin/profile",
      },
    ],
  },
  staticPages: {
    name: "Páginas",
    links: [
      {
        name: "Sobre Nosotros",
        href: "/admin/pages/about",
      },
      {
        name: "Aviso Legal",
        href: "/admin/pages/legal",
      },
      {
        name: "Política de Privacidad",
        href: "/admin/pages/privacy",
      },
      {
        name: "Términos y Condiciones",
        href: "/admin/pages/terms",
      },
    ],
  },
};

function AdminLayout() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader>
          <h1 className="mx-auto pt-4 font-extrabold text-xl">
            <Link to="/">NeXusTC Admin</Link>
          </h1>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <HasPermissions permissions={{ user: ["list"] }}>
                <SidebarLinks item={nav.users} />
              </HasPermissions>
              <HasPermissions
                permissions={{
                  terms: ["list", "create"],
                }}
              >
                <SidebarLinks item={nav.terms} />
              </HasPermissions>
              <HasPermissions
                permissions={{
                  posts: ["list", "create"],
                }}
              >
                <SidebarLinks item={nav.posts} />
              </HasPermissions>
              <HasPermissions permissions={{ comics: ["create"] }}>
                <SidebarLinks item={nav.comics} />
              </HasPermissions>
              <HasPermissions permissions={{ posts: ["create"] }}>
                <SidebarLinks item={nav.extras} />
              </HasPermissions>
              <HasPermissions permissions={{ chronos: ["update"] }}>
                <SidebarLinks item={nav.chronos} />
              </HasPermissions>
              <HasPermissions permissions={{ emojis: ["list"] }}>
                <SidebarLinks item={nav.emojis} />
              </HasPermissions>
              <HasPermissions permissions={{ stickers: ["list"] }}>
                <SidebarLinks item={nav.stickers} />
              </HasPermissions>
              <HasPermissions permissions={{ staticPages: ["update"] }}>
                <SidebarLinks item={nav.staticPages} />
              </HasPermissions>
              <HasOwner>
                <SidebarLinks item={nav.profile} />
              </HasOwner>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <main className="container w-full p-4">
        <ImpersonationBanner />
        <Suspense fallback={<Loader />}>
          <Outlet />
        </Suspense>
      </main>
    </SidebarProvider>
  );
}

type NavLink = {
  name: string;
  href: string;
  permissions?: AtLeastOne<Permissions>;
};

function SidebarLinks({ item }: { item: { name: string; links: NavLink[] } }) {
  return (
    <Collapsible className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger>
          <SidebarMenuButton tooltip={item.name}>
            <span>{item.name}</span>
            <HugeiconsIcon
              className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
              icon={ChevronRight}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.links?.map((link) => {
              const subItem = (
                <SidebarMenuSubItem key={link.name}>
                  <SidebarMenuSubButton render={<Link to={link.href} />}>
                    {link.name}
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );

              if (link.permissions) {
                return (
                  <HasPermissions
                    key={link.name}
                    permissions={link.permissions}
                  >
                    {subItem}
                  </HasPermissions>
                );
              }

              return subItem;
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
