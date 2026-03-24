import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SignedOut({ children }: React.PropsWithChildren) {
  const { data: auth } = authClient.useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (!auth?.session) {
    return children;
  }

  return null;
}
