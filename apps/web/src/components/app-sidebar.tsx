import {
  Book03Icon,
  BubbleChatQuestionIcon,
  CircleLockIcon,
  Clock01Icon,
  GameController03Icon,
  Home01Icon,
  Login03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage, Facehash } from "facehash";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { cn, defaultFacehashProps, getBucketUrl } from "@/lib/utils";
import { AuthDialog, AuthDialogContent } from "./auth/auth-dialog";
import { Button } from "./ui/button";

const navItems = [
  { href: "/", label: "Inicio", search: {}, icon: Home01Icon },
  {
    href: "/search",
    label: "Juegos",
    search: { type: "juegos" },
    icon: GameController03Icon,
  },
  {
    href: "/search",
    label: "Comics",
    search: { type: "comics" },
    icon: Book03Icon,
  },
  {
    href: "/tutorials",
    label: "Tutoriales",
    search: {},
    icon: BubbleChatQuestionIcon,
  },
  { href: "/chronos", label: "Chronos", search: {}, icon: Clock01Icon },
] as const;

export function AppSidebar() {
  const auth = authClient.useSession();
  const [openAuth, setOpenAuth] = useState(false);
  const user = auth.data?.user;
  const imageSrc = user?.image ? getBucketUrl(user.image) : undefined;

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="inline-flex w-full items-center justify-center overflow-hidden"
                render={<Link to="/" />}
                size="lg"
              >
                <h1 className="line-clamp-2 bg-linear-to-br from-primary to-accent bg-clip-text text-center font-[Lexend] font-bold text-2xl text-transparent tracking-tight">
                  N
                  <span className="transition-[opacity,transform] duration-300 group-data-[state=collapsed]:scale-x-0 group-data-[state=collapsed]:opacity-0">
                    eXusTC
                    <span className="align-super font-normal text-muted-foreground text-xs">
                      +18
                    </span>
                  </span>
                </h1>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navegación</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={`${item.href}-${item.label}`}>
                    <SidebarMenuButton
                      className="text-[0.95rem] tracking-wider [&_svg]:size-5"
                      render={<Link search={item.search} to={item.href} />}
                    >
                      <HugeiconsIcon icon={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-sidebar-border border-t pt-3">
          {user && user.role !== "user" && (
            <Button nativeButton={false} render={<Link to="/admin" />}>
              <HugeiconsIcon icon={CircleLockIcon} />
              <span>Admin</span>
            </Button>
          )}
          <SidebarAuthAction
            imageSrc={imageSrc}
            isPending={auth.isPending}
            onLoginClick={() => setOpenAuth(true)}
            user={user}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <AuthDialog onOpenChange={setOpenAuth} open={openAuth}>
        <AuthDialogContent />
      </AuthDialog>
    </>
  );
}

function SidebarAuthAction({
  imageSrc,
  isPending,
  onLoginClick,
  user,
}: {
  imageSrc?: string;
  isPending: boolean;
  onLoginClick: () => void;
  user?: {
    image?: string | null;
    name: string;
  };
}) {
  if (isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            className="min-h-14 cursor-default rounded-xl border border-sidebar-border/70 bg-sidebar-accent/50 px-3 py-3 shadow-[0_10px_30px_-20px_hsl(var(--sidebar-accent-foreground))]"
            size="lg"
          >
            <div className="size-10 animate-pulse rounded-full bg-sidebar-border" />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <span className="w-24 animate-pulse rounded bg-sidebar-border text-transparent">
                Cargando
              </span>
              <span className="w-16 animate-pulse rounded bg-sidebar-border text-transparent text-xs">
                Estado
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            className={cn(
              "min-h-14 cursor-pointer rounded-xl border border-primary/25 bg-linear-to-r from-primary/18 via-accent/10 to-sidebar-accent/80 px-3 py-3 shadow-[0_14px_35px_-24px_hsl(var(--primary))] transition-all duration-200 hover:border-primary/40 hover:from-primary/24 hover:to-sidebar-accent",
              "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0!"
            )}
            render={<Link to="/profile" />}
            size="lg"
          >
            <Avatar className="size-10 rounded-full border border-primary/25">
              <AvatarImage src={imageSrc} />
              <AvatarFallback
                className="rounded-full"
                facehashProps={defaultFacehashProps}
                name={user.name}
              />
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
              <span className="truncate font-semibold text-sm">
                {user.name}
              </span>
              <span className="truncate text-sidebar-foreground/70 text-xs">
                Ver perfil
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className={cn(
            "min-h-14 cursor-pointer rounded-xl border border-primary/30 bg-linear-to-r from-primary/20 via-accent/15 to-primary/5 px-3 py-3 shadow-[0_14px_35px_-24px_hsl(var(--primary))] transition-all duration-200 hover:border-primary/50 hover:from-primary/30 hover:via-accent/20 hover:to-primary/10",
            "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0!"
          )}
          onClick={onLoginClick}
          size="lg"
          tooltip="Iniciar sesi�n"
        >
          <Facehash
            className="size-10 rounded-full border border-primary/25"
            name=""
            {...defaultFacehashProps}
          />
          <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
            <span className="font-semibold text-sm">Iniciar sesión</span>
            <span className="truncate text-sidebar-foreground/70 text-xs">
              Accede a tu perfil
            </span>
          </span>
          <HugeiconsIcon
            className="ml-auto size-4 text-primary group-data-[collapsible=icon]:hidden"
            icon={Login03Icon}
          />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
