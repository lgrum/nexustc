import { ChevronRight } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Permissions } from "@repo/shared/permissions";
import type { AtLeastOne } from "@repo/shared/types";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";

import { URLShortenerDialog } from "@/components/admin/url-shortener-dialog";
import { ImpersonationBanner } from "@/components/admin/users/impersonation-banner";
import { HasPermissions, HasRole } from "@/components/auth/has-role";
import Loader from "@/components/loader";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

import "@blocknote/shadcn/style.css";

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
  chronos: {
    links: [
      {
        href: "/admin/chronos/edit",
        name: "Editar Página",
      },
    ],
    name: "Chronos",
  },
  comics: {
    links: [
      {
        href: "/admin/comics",
        name: "Listar",
      },
      {
        href: "/admin/comics/create",
        name: "Crear",
      },
    ],
    name: "Comics",
  },
  emojis: {
    links: [
      {
        href: "/admin/emojis",
        name: "Listar",
      },
      {
        href: "/admin/emojis/create",
        name: "Crear",
      },
    ],
    name: "Emojis",
  },
  extras: {
    links: [
      {
        href: "/admin/extras/weekly",
        name: "Juegos de la Semana",
      },
      {
        href: "/admin/extras/featured",
        name: "Posts Destacados",
      },
      {
        href: "/admin/extras/engagement",
        name: "Preguntas de Debate",
      },
      {
        href: "/admin/extras/tutorials",
        name: "Tutoriales",
      },
    ],
    name: "Extras",
  },
  media: {
    links: [
      {
        href: "/admin/media",
        name: "Biblioteca",
      },
    ],
    name: "Media",
  },
  notifications: {
    links: [
      {
        href: "/admin/notifications/announcements",
        name: "Anuncios globales",
      },
      {
        href: "/admin/notifications/articles",
        name: "Articulos manuales",
      },
    ],
    name: "Notificaciones",
  },
  posts: {
    links: [
      {
        href: "/admin/posts",
        name: "Listar",
      },
      {
        href: "/admin/posts/create",
        name: "Crear",
      },
    ],
    name: "Posts",
  },
  profile: {
    links: [
      {
        href: "/admin/profile",
        name: "Visuales",
      },
    ],
    name: "Perfiles",
  },
  staticPages: {
    links: [
      {
        href: "/admin/pages/about",
        name: "Sobre Nosotros",
      },
      {
        href: "/admin/pages/legal",
        name: "Aviso Legal",
      },
      {
        href: "/admin/pages/privacy",
        name: "Política de Privacidad",
      },
      {
        href: "/admin/pages/terms",
        name: "Términos y Condiciones",
      },
    ],
    name: "Páginas",
  },
  stickers: {
    links: [
      {
        href: "/admin/stickers",
        name: "Listar",
      },
      {
        href: "/admin/stickers/create",
        name: "Crear",
      },
    ],
    name: "Stickers",
  },
  terms: {
    links: [
      {
        href: "/admin/terms",
        name: "Listar",
      },
      {
        href: "/admin/terms/create",
        name: "Crear",
      },
    ],
    name: "Términos",
  },
  users: {
    links: [
      {
        href: "/admin/users",
        name: "Listar",
      },
      {
        href: "/admin/users/manage",
        name: "Gestionar",
        permissions: { user: ["set-role"] } as AtLeastOne<Permissions>,
      },
    ],
    name: "Usuarios",
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
              <HasPermissions permissions={{ media: ["list"] }}>
                <SidebarLinks item={nav.media} />
              </HasPermissions>
              <HasPermissions permissions={{ notifications: ["list"] }}>
                <SidebarLinks item={nav.notifications} />
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
              <HasRole authRole="owner">
                <SidebarLinks item={nav.profile} />
              </HasRole>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <HasPermissions permissions={{ shortener: ["use"] }}>
            <URLShortenerDialog triggerClassName="w-full justify-center" />
          </HasPermissions>
        </SidebarFooter>
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
