import { SquareLock01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function UserSection() {
  const { data: auth } = authClient.useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (auth?.session) {
    const { role } = auth.user;

    return (
      <>
        <Button
          nativeButton={false}
          render={<Link to="/profile" />}
          variant="ghost"
        >
          <HugeiconsIcon className="size-5" icon={UserIcon} />
          Perfil
        </Button>
        {role !== "user" && (
          <Button
            nativeButton={false}
            render={<Link to="/admin" />}
            variant="ghost"
          >
            <HugeiconsIcon className="size-5" icon={SquareLock01Icon} />
            Admin
          </Button>
        )}
      </>
    );
  }
}
