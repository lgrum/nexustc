"use client";

import { ChevronRight } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Permissions } from "@repo/shared/permissions";
import type { AtLeastOne } from "@repo/shared/types";
import Link from "next/link";

import { URLShortenerDialog } from "@/components/admin/url-shortener-dialog";
import { ImpersonationBanner } from "@/components/admin/users/impersonation-banner";
import {
  HasAnyPermissions,
  HasPermissions,
  HasRole,
} from "@/components/auth/has-role";
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
  changelog: {
    links: [
      {
        href: "/admin/changelog",
        name: "Ver cambios",
      },
    ],
    name: "Changelog",
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
  creators: {
    links: [
      {
        href: "/admin/creators",
        name: "Gestionar",
      },
    ],
    name: "Creadores",
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
  moderation: {
    links: [
      {
        href: "/admin/moderation/forbidden-content",
        name: "Contenido prohibido",
      },
    ],
    name: "Moderacion",
  },
  notifications: {
    links: [
      {
        href: "/admin/notifications/announcements",
        name: "Listar anuncios",
        permissions: { notifications: ["list"] } as AtLeastOne<Permissions>,
      },
      {
        href: "/admin/notifications/announcements/create",
        name: "Crear anuncio",
        permissions: { notifications: ["create"] } as AtLeastOne<Permissions>,
      },
      {
        href: "/admin/notifications/articles",
        name: "Listar articulos",
        permissions: { newsArticles: ["list"] } as AtLeastOne<Permissions>,
      },
      {
        href: "/admin/notifications/articles/create",
        name: "Crear articulo",
        permissions: { newsArticles: ["create"] } as AtLeastOne<Permissions>,
      },
    ],
    name: "Notificaciones",
  },
  patreon: {
    links: [
      {
        href: "/admin/patreon/webhooks",
        name: "Webhooks",
      },
    ],
    name: "Patreon",
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
        name: "Asignaciones",
      },
      {
        href: "/admin/profile/roles",
        name: "Roles",
      },
      {
        href: "/admin/profile/emblems",
        name: "Emblemas",
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
  site: {
    links: [
      {
        href: "/admin/site/marquee",
        name: "Marquesina",
      },
    ],
    name: "Sitio",
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader>
          <h1 className="mx-auto pt-4 font-extrabold text-xl">
            <Link href="/">NeXusTC Admin</Link>
          </h1>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <HasPermissions permissions={{ user: ["list"] }}>
                <SidebarLinks item={nav.users} />
              </HasPermissions>
              <SidebarLinks item={nav.changelog} />
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
              <HasPermissions permissions={{ creators: ["list"] }}>
                <SidebarLinks item={nav.creators} />
              </HasPermissions>
              <HasPermissions permissions={{ posts: ["create"] }}>
                <SidebarLinks item={nav.extras} />
              </HasPermissions>
              <HasPermissions permissions={{ media: ["list"] }}>
                <SidebarLinks item={nav.media} />
              </HasPermissions>
              <HasPermissions permissions={{ moderation: ["list"] }}>
                <SidebarLinks item={nav.moderation} />
              </HasPermissions>
              <HasAnyPermissions
                permissions={[
                  { newsArticles: ["list"] },
                  { notifications: ["list"] },
                ]}
              >
                <SidebarLinks item={nav.notifications} />
              </HasAnyPermissions>
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
                <SidebarLinks item={nav.site} />
              </HasRole>
              <HasRole authRole="owner">
                <SidebarLinks item={nav.patreon} />
              </HasRole>
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
        {children}
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
        <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.name} />}>
          <span>{item.name}</span>
          <HugeiconsIcon
            className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
            icon={ChevronRight}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.links?.map((link) => {
              const subItem = (
                <SidebarMenuSubItem key={link.name}>
                  <SidebarMenuSubButton render={<Link href={link.href} />}>
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
