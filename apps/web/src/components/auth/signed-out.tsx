import { useHasHydrated } from "@/hooks/use-has-hydrated";
import { authClient } from "@/lib/auth-client";

export function SignedOut({ children }: React.PropsWithChildren) {
  const { data: auth } = authClient.useSession();
  const mounted = useHasHydrated();

  if (!mounted) {
    return null;
  }

  if (!auth?.session) {
    return children;
  }

  return null;
}
