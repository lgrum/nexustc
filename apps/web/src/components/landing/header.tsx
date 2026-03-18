import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage, Facehash } from "facehash";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { defaultFacehashProps, getBucketUrl } from "@/lib/utils";
import {
  AuthDialog,
  AuthDialogContent,
  AuthDialogTrigger,
} from "../auth/auth-dialog";
import { Logo } from "../logo";
import { SidebarTrigger } from "../ui/sidebar";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-border border-b bg-background">
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <SidebarTrigger className="text-foreground" />
          </div>
        </div>
        <Link to="/">
          <Logo />
        </Link>
        <div className="flex items-center justify-end gap-2 md:hidden">
          <ProfileNavItem />
        </div>
      </div>
    </header>
  );
}

function ProfileNavItem() {
  const { data: auth } = authClient.useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthed = mounted && Boolean(auth?.session);
  const href = isAuthed ? "/profile" : "/auth";
  const displayName = isAuthed ? (auth?.user.name ?? "cronos") : "cronos";
  const imageSrc = isAuthed
    ? auth?.user.image
      ? getBucketUrl(auth.user.image)
      : undefined
    : undefined;

  if (!isAuthed) {
    return (
      <AuthDialog>
        <AuthDialogTrigger
          nativeButton={false}
          render={
            <Facehash
              name=""
              {...defaultFacehashProps}
              className="size-8 rounded-full"
            />
          }
        />
        <AuthDialogContent />
      </AuthDialog>
    );
  }

  return (
    <Link to={href}>
      <Avatar className="size-8 rounded-full">
        <AvatarImage src={imageSrc} />
        <AvatarFallback
          className="rounded-full"
          facehashProps={defaultFacehashProps}
          name={displayName}
        />
      </Avatar>
    </Link>
  );
}
